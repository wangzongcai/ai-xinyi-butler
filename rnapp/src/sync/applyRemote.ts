// =====================================================================
// 把云端数据落到本地（M12）
// 关键约束：
//   1. 这里直接写 SQL，绝不经过 Repository，也不入 outbox —— 否则会形成回环。
//   2. 冲突按「updated_at 较新者胜」；时间统一转毫秒比较。
//   3. 云端已彻底删除的行由墓碑表达，收到墓碑就本地硬删并记住，防止旧数据复活。
// =====================================================================
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from '../db/client';
import { withWriteTransaction } from '../db/tx';
import { LOCAL_COLUMNS, LOCAL_TABLE, type SyncTable, toIso, timeMs } from './mappers';

type Row = Record<string, unknown>;

const TOMBSTONE_KEY = (table: string, id: string) => `${table}:${id}`;

/** 业务键（用于 history / prepare 跨设备去重）。 */
function naturalKeyWhere(
  table: SyncTable,
  row: Row,
): { sql: string; params: (string | null)[] } | null {
  if (table === 'history') {
    return {
      sql: 'person_id IS ? AND name = ?',
      params: [(row.person_id as string | null) ?? null, String(row.name)],
    };
  }
  if (table === 'prepare') {
    return {
      sql: 'scene = ? AND person_id IS ? AND festival_code IS ?',
      params: [
        String(row.scene),
        (row.person_id as string | null) ?? null,
        (row.festival_code as string | null) ?? null,
      ],
    };
  }
  return null;
}

function upsertSql(table: SyncTable): string {
  const cols = LOCAL_COLUMNS[table];
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols
    .filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  return `INSERT INTO ${LOCAL_TABLE[table]} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`;
}

/**
 * 应用一批云端业务行，返回实际写入的条数。
 * @param rows 云端行（snake_case，含 user_id / origin_device_id 等额外列）
 */
export async function applyRemoteRows(table: SyncTable, rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;
  return withWriteTransaction(async (txn) => {
    const tombstones = new Set(
      (
        await txn.getAllAsync<{ table_name: string; row_id: string }>(
          'SELECT table_name, row_id FROM sync_tombstone',
        )
      ).map((r) => TOMBSTONE_KEY(r.table_name, r.row_id)),
    );
    let applied = 0;
    for (const remote of rows) {
      if (await applyOne(txn, table, remote, tombstones)) applied += 1;
    }
    return applied;
  });
}

async function applyOne(
  txn: SQLiteDatabase,
  table: SyncTable,
  remote: Row,
  tombstones: Set<string>,
): Promise<boolean> {
  const id = String(remote.id);
  if (!id) return false;
  // 该行已被彻底删除：任何延迟到达的旧数据都不能复活它
  if (tombstones.has(TOMBSTONE_KEY(table, id))) return false;

  const remoteMs = timeMs(remote.updated_at);
  // 逻辑表名与本地表名可能不同（gift → gift_suggestion），本地 SQL 一律用映射后的名字
  const localName = LOCAL_TABLE[table];
  const local = await txn.getFirstAsync<Row>(`SELECT * FROM ${localName} WHERE id = ?`, id);

  // 业务键去重：同一对象的同一天记录可能被两台设备各自生成（id 不同）
  const key = naturalKeyWhere(table, remote);
  if (key) {
    const dup = await txn.getFirstAsync<Row>(
      `SELECT * FROM ${localName} WHERE ${key.sql} AND id <> ? LIMIT 1`,
      ...key.params,
      id,
    );
    if (dup) {
      const dupMs = timeMs(dup.updated_at);
      if (remoteMs >= dupMs) {
        const dupId = String(dup.id);
        await txn.runAsync(`DELETE FROM ${localName} WHERE id = ?`, dupId);
        await txn.runAsync('DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ?', table, dupId);
      } else {
        // 本地这条更新：保留本地，等推送时由服务端唯一索引去重
        return false;
      }
    }
  }

  if (local) {
    const localMs = timeMs(local.updated_at);
    if (localMs > remoteMs) return false; // 本地更新，保留
    if (localMs === remoteMs) {
      const dirty = await txn.getFirstAsync<{ seq: number }>(
        'SELECT seq FROM sync_outbox WHERE table_name = ? AND row_id = ? LIMIT 1',
        table,
        id,
      );
      if (dirty) return false; // 同时间且本地有待推送改动 → 以本地为准，避免无意义覆盖
    }
  }

  const values: (string | number | null)[] = LOCAL_COLUMNS[table].map((col) => {
    const v = remote[col];
    if (col === 'created_at' || col === 'updated_at' || col === 'deleted_at') return toIso(v);
    if (col === 'blessings') return JSON.stringify(Array.isArray(v) ? v : []);
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' || typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return JSON.stringify(v);
  });
  await txn.runAsync(upsertSql(table), ...values);
  // 云端已采纳该行，本地等待推送的旧改动作废
  await txn.runAsync('DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ?', table, id);
  return true;
}

/**
 * 应用云端 settings（只合并可同步列，本机专属列保持不动）。
 *
 * 关键：本机从未改过设置（sync_meta.settings_edited = 0，典型是重装后的全新库）时
 * 不做 LWW 比较，直接用云端值覆盖。否则默认行建库时写入的新时间戳会把云端真实设置挡掉。
 */
export async function applyRemoteSettings(remote: Row): Promise<boolean> {
  const remoteMs = timeMs(remote.updated_at);
  return withWriteTransaction(async (txn) => {
    const local = await txn.getFirstAsync<{
      updated_at: string;
      sync_updated_at: string | null;
    }>("SELECT updated_at, sync_updated_at FROM settings WHERE id = 'default'");
    const meta = await txn.getFirstAsync<{ settings_edited: number | null }>(
      "SELECT settings_edited FROM sync_meta WHERE id = 'default'",
    );
    const localEdited = meta?.settings_edited === 1;
    if (localEdited) {
      const localMs = timeMs(local?.sync_updated_at ?? local?.updated_at);
      const dirty = await txn.getFirstAsync<{ seq: number }>(
        "SELECT seq FROM sync_outbox WHERE table_name = 'settings' AND row_id = 'default' LIMIT 1",
      );
      if (localMs > remoteMs) return false;
      if (localMs === remoteMs && dirty) return false;
    }

    const followed = remote.festival_followed;
    await txn.runAsync(
      `UPDATE settings SET
         advance_days = ?, blessing_count = ?, ecommerce_platform = ?, card_signature = ?,
         festival_followed = ?, reminder_hour = ?, reminder_minute = ?, gift_enabled = ?,
         card_enabled = ?, signature_text = ?, updated_at = ?, sync_updated_at = ?
       WHERE id = 'default'`,
      Number(remote.advance_days ?? 3),
      Number(remote.blessing_count ?? 3),
      String(remote.ecommerce_platform ?? '淘宝'),
      remote.card_signature ? 1 : 0,
      JSON.stringify(followed && typeof followed === 'object' ? followed : {}),
      Number(remote.reminder_hour ?? 9),
      Number(remote.reminder_minute ?? 0),
      remote.gift_enabled ? 1 : 0,
      remote.card_enabled ? 1 : 0,
      (remote.signature_text as string | null) ?? null,
      toIso(remote.updated_at),
      toIso(remote.updated_at),
    );
    await txn.runAsync(
      "DELETE FROM sync_outbox WHERE table_name = 'settings' AND row_id = 'default'",
    );
    return true;
  }).catch(() => false);
}

/** 应用墓碑：本地硬删并记住，返回实际删除条数。 */
export async function applyRemoteTombstones(
  rows: { table_name: string; row_id: string; deleted_at?: string | null }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  return withWriteTransaction(async (txn) => {
    let deleted = 0;
    for (const row of rows) {
      const table = row.table_name as SyncTable;
      if (!LOCAL_COLUMNS[table]) continue;
      const id = String(row.row_id);
      await txn.runAsync(
        'INSERT OR IGNORE INTO sync_tombstone (table_name, row_id, deleted_at) VALUES (?, ?, ?)',
        table,
        id,
        toIso(row.deleted_at) ?? new Date().toISOString(),
      );
      const res = await txn.runAsync(`DELETE FROM ${LOCAL_TABLE[table]} WHERE id = ?`, id);
      if (res.changes > 0) deleted += 1;
      await txn.runAsync('DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ?', table, id);
      // person 被级联删掉的子表也会各自收到墓碑，这里无需额外处理
    }
    return deleted;
  });
}

/** 本地是否已有某条墓碑（推送前判断，避免把已删行又写回云端）。 */
export async function hasTombstone(table: SyncTable, rowId: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ row_id: string }>(
    'SELECT row_id FROM sync_tombstone WHERE table_name = ? AND row_id = ?',
    table,
    rowId,
  );
  return Boolean(row);
}
