// =====================================================================
// 云同步引擎（M12）
// 职责：把本地 outbox 推到 Supabase，把云端数据拉回本地，并订阅实时变更。
// 设计要点（详见 plan / data-model「云同步设计」）：
//   * 所有同步任务串行执行，避免 push/pull 相互覆盖。
//   * 先 push 再 pull：否则云端旧值会盖掉本机尚未上报的新值。
//   * Realtime 只当「失效通知」：收到事件后整体重新拉取，不直接消费 payload。
//     （Supabase 的 DELETE 事件在 RLS 下拿不到 user_id，删除只能靠墓碑表。）
//   * 删除用墓碑表表达，不做「云端没有就删本地」的推断（分页/断网会误删）。
// =====================================================================
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../auth/supabase';
import {
  adoptLegacyDatabase,
  getActiveUserId,
  getDatabase,
  getSyncMeta,
  inspectLegacyDatabase,
  setSyncMeta,
  type LegacySummary,
} from '../db/client';
import { withWriteTransaction } from '../db/tx';
import { applyRemoteRows, applyRemoteSettings, applyRemoteTombstones, hasTombstone } from './applyRemote';
import {
  LOCAL_TABLE,
  REMOTE_TABLE,
  SYNC_TABLES,
  localToRemote,
  settingsToRemote,
  timeMs,
  type OutboxTable,
  type SyncTable,
} from './mappers';
import { ack, enqueue, listOutbox, pendingCount, type OutboxItem } from './outbox';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error' | 'blocked';

export type SyncSnapshot = {
  phase: SyncPhase;
  /** 首次同步（恢复/上传）进行中 */
  bootstrapping: boolean;
  lastSyncedAt: string | null;
  /** 待推送条数 */
  pending: number;
  /** 本地数据版本号：远端数据落库后自增，页面据此重新加载 */
  dataVersion: number;
  error: string | null;
  /** 本机与云端都有数据、等待用户确认 */
  conflict: { localRows: number; cloudRows: number } | null;
  /** 永久失败的推送条数（已落死信表，需要人工检查） */
  deadLetters: number;
  /** 旧单库迁移结果（同步页展示一次说明） */
  legacy: LegacySummary | null;
};

const FALLBACK_DEVICE_ID = '00000000-0000-4000-8000-000000000000';

let snapshot: SyncSnapshot = {
  phase: 'idle',
  bootstrapping: false,
  lastSyncedAt: null,
  pending: 0,
  dataVersion: 0,
  error: null,
  conflict: null,
  deadLetters: 0,
  legacy: null,
};

const listeners = new Set<(s: SyncSnapshot) => void>();
let startedUid: string | null = null;
let channel: RealtimeChannel | null = null;
/** 当前频道绑定的账号，用于识别「账号已切换、需重建频道」 */
let channelUid: string | null = null;
let realtimeTimer: ReturnType<typeof setTimeout> | null = null;

export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

export function subscribeSync(listener: (s: SyncSnapshot) => void): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}

function setSnapshot(patch: Partial<SyncSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener(snapshot);
}

// ---------------------------------------------------------------------
// 串行队列
// ---------------------------------------------------------------------

let queue: Promise<unknown> = Promise.resolve();

function runSerial<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  // 吞掉链上的异常，避免一次失败让后续任务全部短路
  queue = next.catch(() => undefined);
  return next;
}

// ---------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------

type SyncError = Error & { permanent?: boolean; expected?: boolean };

function toSyncError(raw: unknown, table?: SyncTable): SyncError {
  const err =
    raw instanceof Error ? raw : new Error(String((raw as { message?: string })?.message ?? raw));
  const code = String((raw as { code?: string })?.code ?? '');
  const result = err as SyncError;
  // 唯一索引冲突：另一台设备已生成同一业务键的行，交给 pull 去重收敛，不算失败
  if (table && (code === '23505' || /duplicate key/i.test(err.message))) {
    result.permanent = true;
    result.expected = true;
    return result;
  }
  // 数据/结构类错误重试也没用，直接暴露到同步页
  result.permanent =
    code.startsWith('22') || ['23502', '23503', '23514', '42P01', '42501', '42703'].includes(code);
  return result;
}

/** 会话/令牌类错误：刷新后可重试，不能当永久错误丢掉。 */
function isAuthError(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? '');
  const status = Number((error as { status?: number })?.status ?? 0);
  const message = messageOf(error);
  return (
    status === 401 ||
    code === 'PGRST301' ||
    code === '401' ||
    /jwt expired|invalid jwt|token.*expired/i.test(message)
  );
}

/** 永久失败的推送落死信表：不阻塞队列，也不静默丢数据。 */
async function writeDeadLetter(table: OutboxTable, rowId: string, error: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      'INSERT INTO sync_dead_letter (table_name, row_id, error) VALUES (?, ?, ?) ' +
        'ON CONFLICT(table_name, row_id) DO UPDATE SET error = excluded.error',
      table,
      rowId,
      error.slice(0, 500),
    );
  } catch {
    // 死信写入失败不影响同步流程
  }
}

async function countDeadLetters(): Promise<number> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM sync_dead_letter');
    setSnapshot({ deadLetters: row?.c ?? 0 });
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '同步失败，请稍后重试';
}

// ---------------------------------------------------------------------
// 对外入口
// ---------------------------------------------------------------------

/** 登录后初始化：首次同步（可能迁移旧库/上传本机数据），之后建立实时订阅。 */
export async function initForUser(uid: string): Promise<void> {
  if (startedUid === uid) {
    void syncNow();
    return;
  }
  // A 直接切到 B（不经过退出登录）：先拆掉 A 的实时频道，否则频道仍属于旧账号
  await teardownRealtime();
  startedUid = uid;
  setSnapshot({ bootstrapping: true, error: null });

  try {
    const meta = await getSyncMeta();
    if (meta.bootstrapState === 'ready') {
      setSnapshot({ bootstrapping: false, lastSyncedAt: meta.lastSyncAt });
      await syncNow();
      startRealtime(uid);
      return;
    }

    const cloudRows = await cloudRowCount(uid);
    if (cloudRows === 0) {
      // 云端为空：先看看有没有升级前的旧单库数据，再整库上传（含本机设置）
      if (!meta.legacyAdopted) await tryAdoptLegacy();
      await uploadAll(true);
      await push(uid);
      await pull(uid);
      await setSyncMeta({ bootstrapState: 'ready', lastError: null });
    } else if ((await pendingCount()) > 0) {
      // 本机有待推送改动 + 云端已有数据：交给用户确认后再合并
      await setSyncMeta({ bootstrapState: 'blocked' });
      setSnapshot({
        phase: 'blocked',
        bootstrapping: false,
        conflict: { localRows: await localRowCount(), cloudRows },
      });
      return;
    } else {
      await pull(uid);
      await setSyncMeta({ bootstrapState: 'ready', lastError: null });
    }

    const now = new Date().toISOString();
    await setSyncMeta({ lastSyncAt: now });
    setSnapshot({
      phase: 'idle',
      bootstrapping: false,
      conflict: null,
      error: null,
      pending: await pendingCount(),
      lastSyncedAt: now,
      dataVersion: snapshot.dataVersion + 1,
    });
    startRealtime(uid);
  } catch (error) {
    // 首次同步失败多半是断网：保持 unbound，下次回前台/重连再试
    startedUid = null;
    handleError(error);
  }
}

/** 首次同步冲突时用户确认「按更新时间合并」。 */
export async function resolveBootstrapConflict(): Promise<void> {
  const uid = getActiveUserId();
  if (!uid) return;
  setSnapshot({ phase: 'syncing', conflict: null });
  await runSerial(async () => {
    try {
      // 必须先把云端数据合并到本机，再上传本机：否则本机的旧数据会以「整库上传」的形式
      // 覆盖掉云端较新的记录（resolveBootstrapConflict 的语义是「按更新时间合并」）。
      const applied = await pull(uid);
      const hasCloudSettings = await remoteSettingsExists(uid);
      await uploadAll(!hasCloudSettings);
      await push(uid);
      await pull(uid);
      const now = new Date().toISOString();
      await setSyncMeta({ bootstrapState: 'ready', lastSyncAt: now, lastError: null });
      setSnapshot({
        phase: 'idle',
        bootstrapping: false,
        conflict: null,
        error: null,
        pending: await pendingCount(),
        lastSyncedAt: now,
        dataVersion: snapshot.dataVersion + (applied > 0 ? 1 : 0),
      });
      startRealtime(uid);
    } catch (error) {
      handleError(error);
    }
  });
}

/** 手动/定时同步：推本地改动，再全量拉取。 */
export function syncNow(): Promise<void> {
  const uid = getActiveUserId();
  if (!uid || submittedUid() !== uid) return Promise.resolve();
  return runSerial(() => doSync(uid)).catch(() => undefined);
}

function submittedUid(): string | null {
  return startedUid;
}

async function doSync(uid: string): Promise<void> {
  if (startedUid !== uid) return;
  const meta = await getSyncMeta();
  if (meta.bootstrapState !== 'ready') return;

  setSnapshot({ phase: 'syncing', error: null });
  try {
    await push(uid);
    const applied = await pull(uid);
    const now = new Date().toISOString();
    await setSyncMeta({ lastSyncAt: now, lastError: null });
    setSnapshot({
      phase: 'idle',
      pending: await pendingCount(),
      lastSyncedAt: now,
      error: null,
      dataVersion: snapshot.dataVersion + (applied > 0 ? 1 : 0),
    });
  } catch (error) {
    handleError(error);
    throw error;
  }
}

function handleError(error: unknown): void {
  const err = error as SyncError;
  const message = messageOf(error);
  const offline = !err?.permanent;
  setSnapshot({
    phase: offline ? 'offline' : 'error',
    bootstrapping: false,
    error: message,
    pending: snapshot.pending,
  });
  void setSyncMeta({ lastError: message }).catch(() => {});
}

/** 拆掉实时频道与待执行的拉取定时器（退出登录、切换账号都要用）。 */
async function teardownRealtime(): Promise<void> {
  if (realtimeTimer) {
    clearTimeout(realtimeTimer);
    realtimeTimer = null;
  }
  const current = channel;
  channel = null;
  channelUid = null;
  if (current) {
    try {
      await supabase.removeChannel(current);
    } catch {
      // 忽略断开失败
    }
  }
}

/** 停止同步并断开实时连接（退出登录时调用；库文件保留）。 */
export async function stopSync(): Promise<void> {
  startedUid = null;
  await teardownRealtime();
  setSnapshot({
    phase: 'idle',
    bootstrapping: false,
    pending: 0,
    conflict: null,
    error: null,
    legacy: null,
  });
}

/** 回到前台：补一次同步并确保实时订阅存在（Realtime 不重放断线期间的事件）。 */
export function resumeSync(): void {
  const uid = getActiveUserId();
  if (!uid || startedUid !== uid) return;
  startRealtime(uid);
  void syncNow();
}

/** 刷新待推送条数（同步页/设置页展示用）。 */
export async function refreshPendingCount(): Promise<number> {
  try {
    const count = await pendingCount();
    setSnapshot({ pending: count });
    await countDeadLetters();
    return count;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------
// 首次同步辅助
// ---------------------------------------------------------------------

async function tryAdoptLegacy(): Promise<void> {
  const summary = await inspectLegacyDatabase();
  const total =
    summary.persons + summary.anniversaries + summary.traits + summary.history + summary.prepares;
  if (total === 0 && !summary.settingsTouched) {
    await setSyncMeta({ legacyAdopted: true });
    return;
  }
  const adopted = await adoptLegacyDatabase();
  if (adopted) {
    setSnapshot({ legacy: adopted });
    await setSyncMeta({ legacyAdopted: true });
  }
}

/**
 * 把本机全部行标记为待推送。
 * @param includeSettings 云端已有设置时传 false：设置走 LWW 合并，
 *        无条件重推本机值只会让「本机默认设置」有机会盖掉云端真实设置。
 */
async function uploadAll(includeSettings: boolean): Promise<void> {
  await withWriteTransaction(async (txn) => {
    for (const table of SYNC_TABLES) {
      // 本地 SQL 用本地表名（gift 在本地叫 gift_suggestion）
      const rows = await txn.getAllAsync<{ id: string }>(
        `SELECT id FROM ${LOCAL_TABLE[table]}`,
      );
      for (const row of rows) await enqueue(txn, table, row.id);
    }
    if (includeSettings) await enqueue(txn, 'settings', 'default');
  });
}

async function localRowCount(): Promise<number> {
  const db = await getDatabase();
  let total = 0;
  for (const table of SYNC_TABLES) {
    const row = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ${LOCAL_TABLE[table]}`,
    );
    total += row?.c ?? 0;
  }
  return total;
}

/**
 * 云端业务行总数（各同步业务表 + 是否已有 settings）。用于判断云端是否为空。
 * 只数 person 会漏判：对象被彻底删除后云端可能只剩 history / prepare / gift。
 */
async function cloudRowCount(uid: string): Promise<number> {
  let total = 0;
  for (const table of SYNC_TABLES) {
    const { count, error } = await supabase
      .from(REMOTE_TABLE[table])
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid);
    if (error) throw toSyncError(error);
    total += count ?? 0;
  }
  const settings = await supabase
    .from('user_settings')
    .select('user_id')
    .eq('user_id', uid)
    .maybeSingle();
  if (settings.error) throw toSyncError(settings.error);
  return total + (settings.data ? 1 : 0);
}

/** 云端是否已有设置行（决定首次合并时要不要把本机设置推上去）。 */
async function remoteSettingsExists(uid: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('user_id')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw toSyncError(error);
  return Boolean(data);
}

// ---------------------------------------------------------------------
// 推送
// ---------------------------------------------------------------------

/** 推送顺序：person 必须先于子表（服务端外键依赖）。 */
const PUSH_ORDER: Record<OutboxTable, number> = {
  person: 0,
  anniversary: 1,
  trait: 1,
  history: 1,
  prepare: 1,
  gift: 1,
  settings: 2,
};

async function push(uid: string): Promise<void> {
  const meta = await getSyncMeta();
  const deviceId = meta.deviceId || FALLBACK_DEVICE_ID;
  const items = await listOutbox();
  if (items.length === 0) return;
  items.sort((a, b) => PUSH_ORDER[a.table] - PUSH_ORDER[b.table] || a.seq - b.seq);

  const acked: number[] = [];
  let wroteDead = false;
  for (const item of items) {
    if (startedUid !== uid) break;
    try {
      await pushOne(item, uid, deviceId);
      acked.push(item.seq);
    } catch (error) {
      if (isAuthError(error)) {
        // 会话过期：刷新令牌后按可重试处理，下次同步会自动重试，不写死信
        try {
          await supabase.auth.refreshSession();
        } catch {
          // 刷新失败（确实登出/断网）：留给下一轮同步
        }
        await ack(acked);
        throw error;
      }
      const err = toSyncError(error, item.table === 'settings' ? undefined : item.table);
      if (err.permanent) {
        // 永久错误（数据非法/重复键）不再重试，避免卡住整条队列；
        // 但直接丢会静默丢数据，先落死信表留证据，同步页可见
        await writeDeadLetter(item.table, item.rowId, err.message);
        wroteDead = true;
        acked.push(item.seq);
        if (!err.expected) setSnapshot({ error: err.message, phase: 'error' });
        continue;
      }
      await ack(acked);
      throw err;
    }
  }
  await ack(acked);
  if (wroteDead) await countDeadLetters();
}

function isDuplicateKey(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? '');
  return code === '23505' || /duplicate key/i.test(messageOf(error));
}

/** 查云端与本地行业务键相同的行（history / prepare）。其他表没有业务键，返回 null。 */
async function findRemoteDuplicate(
  table: SyncTable,
  payload: Record<string, unknown>,
  uid: string,
): Promise<{ id: string; updated_at: string | null }[] | null> {
  const personId = (payload.person_id as string | null) ?? null;
  if (table === 'history') {
    const { data, error } = await supabase
      .from('history')
      .select('id, updated_at')
      .eq('user_id', uid)
      .eq('name', String(payload.name))
      .is('person_id', personId);
    if (error) throw error;
    return (data ?? []) as { id: string; updated_at: string | null }[];
  }
  if (table === 'prepare') {
    const { data, error } = await supabase
      .from('prepare_record')
      .select('id, updated_at')
      .eq('user_id', uid)
      .eq('scene', String(payload.scene))
      .is('person_id', personId)
      .is('festival_code', (payload.festival_code as string | null) ?? null);
    if (error) throw error;
    return (data ?? []) as { id: string; updated_at: string | null }[];
  }
  return null;
}

/**
 * 处理唯一索引 23505：返回 true 表示已处理（重试成功或主动放弃本行）。
 * 返回 false 表示该表没有业务键，交给上层当普通错误抛。
 */
async function replaceRemoteDuplicate(
  table: SyncTable,
  payload: Record<string, unknown>,
  uid: string,
): Promise<boolean> {
  const dups = await findRemoteDuplicate(table, payload, uid);
  if (dups === null) return false;
  if (dups.length === 0) return false;
  const localMs = timeMs(payload.updated_at);
  const newestMs = Math.max(...dups.map((d) => timeMs(d.updated_at)));
  if (localMs <= newestMs) {
    // 云端已有更新的同键行：本行放弃，pull 时本地重复行会被自然收敛掉
    return true;
  }
  // 本地更新：删掉云端占位行（触发器为旧 id 写墓碑，其他设备据此删掉重复行），再重试写入
  for (const dup of dups) {
    const { error } = await supabase
      .from(REMOTE_TABLE[table])
      .delete()
      .eq('user_id', uid)
      .eq('id', dup.id);
    if (error) throw error;
  }
  const retry = await supabase.from(REMOTE_TABLE[table]).upsert(payload, { onConflict: 'id' });
  if (retry.error) throw retry.error;
  return true;
}

async function pushOne(item: OutboxItem, uid: string, deviceId: string): Promise<void> {
  const db = await getDatabase();

  if (item.table === 'settings') {
    const row = await db.getFirstAsync<Record<string, unknown>>(
      "SELECT * FROM settings WHERE id = 'default'",
    );
    if (!row) return;
    const { error } = await supabase
      .from('user_settings')
      .upsert(settingsToRemote(row, uid, deviceId), { onConflict: 'user_id' });
    if (error) throw error;
    return;
  }

  const table = item.table as SyncTable;
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM ${LOCAL_TABLE[table]} WHERE id = ?`,
    item.rowId,
  );

  if (row) {
    // 本地已有墓碑说明该行已彻底删除，不要再写回云端
    if (await hasTombstone(table, item.rowId)) return;
    const payload = localToRemote(table, row, uid, deviceId);
    const { error } = await supabase
      .from(REMOTE_TABLE[table])
      .upsert(payload, { onConflict: 'id' });
    if (!error) return;
    if (isDuplicateKey(error)) {
      // 另一台设备已用相同业务键建了另一 id 的行（history / prepare）。
      // 谁更新谁留下：本地较新就删掉云端占位行再重试，云端较新就放弃本行等 pull 收敛。
      if (await replaceRemoteDuplicate(table, payload, uid)) return;
    }
    throw error;
  }

  // 本地已不存在 → 云端删除（服务端级联并自动写墓碑）
  const { error } = await supabase
    .from(REMOTE_TABLE[table])
    .delete()
    .eq('user_id', uid)
    .eq('id', item.rowId);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// 拉取
// ---------------------------------------------------------------------

const PAGE_SIZE = 1000; // Supabase 单次返回上限

async function fetchAllPages<T>(remoteTable: string, uid: string, orderColumn: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(remoteTable)
      .select('*')
      .eq('user_id', uid)
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

async function pull(uid: string): Promise<number> {
  let applied = 0;

  // 1) 先应用墓碑：彻底删除是终态，先删掉再拉其余数据
  const tombstones = await fetchAllPages<{
    table_name: string;
    row_id: string;
    deleted_at: string | null;
  }>('sync_tombstone', uid, 'row_id');
  applied += await applyRemoteTombstones(tombstones);

  // 2) person 先落库，子表才有外键可依
  for (const table of SYNC_TABLES) {
    const rows = await fetchAllPages<Record<string, unknown>>(REMOTE_TABLE[table], uid, 'id');
    applied += await applyRemoteRows(table, rows);
  }

  // 3) 设置：只合并可同步列
  const settings = await supabase.from('user_settings').select('*').eq('user_id', uid).maybeSingle();
  if (settings.error) throw settings.error;
  if (settings.data) {
    if (await applyRemoteSettings(settings.data)) applied += 1;
  } else {
    // 云端还没有设置行（老账号首次同步 / 被异常删除）：把本机设置推上去，保证服务端有完整副本
    await withWriteTransaction(async (txn) => {
      await enqueue(txn, 'settings', 'default');
    });
  }

  return applied;
}

// ---------------------------------------------------------------------
// 实时订阅
// ---------------------------------------------------------------------

function scheduleRealtime(uid: string, delay = 500): void {
  if (realtimeTimer) clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(() => {
    realtimeTimer = null;
    if (startedUid === uid) void syncNow();
  }, delay);
}

function startRealtime(uid: string): void {
  if (channel) {
    if (channelUid === uid) return;
    // 频道属于另一个账号（A 直切 B）：拆掉重建
    void teardownRealtime();
  }
  const ch = supabase.channel(`sync:${uid}`);
  channelUid = uid;

  // 本机推送也会触发事件，拿到自己的 device_id 后跳过，避免多余的回拉
  let ownDeviceId = '';
  void getSyncMeta()
    .then((meta) => {
      ownDeviceId = meta.deviceId;
    })
    .catch(() => undefined);
  const onChange = (payload?: { new?: Record<string, unknown> }) => {
    if (ownDeviceId && payload?.new?.origin_device_id === ownDeviceId) return;
    scheduleRealtime(uid);
  };

  for (const table of SYNC_TABLES) {
    const remote = REMOTE_TABLE[table];
    // 只订阅 INSERT/UPDATE：DELETE 事件在 RLS 下拿不到 user_id，删除靠墓碑表
    for (const event of ['INSERT', 'UPDATE'] as const) {
      ch.on(
        'postgres_changes',
        { event, schema: 'public', table: remote, filter: `user_id=eq.${uid}` },
        onChange,
      );
    }
  }
  // 设置也要订阅 UPDATE：只在另一台设备改设置时触发（INSERT 是第一台设备首次上传）
  for (const event of ['INSERT', 'UPDATE'] as const) {
    ch.on(
      'postgres_changes',
      { event, schema: 'public', table: 'user_settings', filter: `user_id=eq.${uid}` },
      onChange,
    );
  }
  ch.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'sync_tombstone', filter: `user_id=eq.${uid}` },
    onChange,
  );

  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      void syncNow();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      // 连接异常：退避重连（removeChannel 后下次前台/同步会重建）
      setSnapshot({ phase: snapshot.phase === 'syncing' ? 'syncing' : 'offline' });
      scheduleRealtime(uid, 10_000);
    }
  });

  channel = ch;
}

/** 供测试/调试：当前是否已建立实时连接。 */
export function isRealtimeConnected(): boolean {
  return channel !== null;
}
