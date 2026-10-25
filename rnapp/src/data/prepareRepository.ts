// =====================================================================
// prepare（心意准备）Repository
// 依据 data-model 3.9。持久化祝福语结果：退出准备页再进入展示上次结果；
// 贺卡页按 prepareId 引用同一份内容。
// 场景值：contact 联系人 / holiday 节日。
// person_id（节日「不指定收件人」时为空）与 festival_code 均可空，且按
// data-model 约定「不建唯一索引」，因此本层用「找 updated_at 最新一条，
// 命中则覆盖更新、未命中则新增」的方式实现按场景幂等。未来 Supabase 实现
// 保留同一方法签名。
// =====================================================================
import { getDatabase } from '../db/client';
import { withWriteTransaction } from '../db/tx';
import { enqueue } from '../sync/outbox';
import { uuid } from './uuid';

export type PrepareScene = 'contact' | 'holiday';

export type PrepareRecord = {
  id: string;
  /** 场景：contact 联系人 / holiday 节日 */
  scene: PrepareScene;
  /** 收件人 id；节日「不指定收件人」时为空 */
  personId: string | null;
  /** 节日代码；联系人场景为空 */
  festivalCode: string | null;
  /** 祝福列表（含用户手动编辑后的文字） */
  blessings: string[];
  /** 贺卡当前选中的祝福下标 */
  selectedIndex: number;
  /** AI 生成的贺卡背景图 URL（本机缓存，可能过期，不同步） */
  backgroundUrl: string | null;
  /** 背景图在云端的存储路径（`<uid>/<prepareId>.jpg`）；随账号同步，重装后据此取回原图 */
  backgroundPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrepareKey = {
  scene: PrepareScene;
  personId?: string | null;
  festivalCode?: string | null;
};

type RawRow = {
  id: string;
  scene: string;
  person_id: string | null;
  festival_code: string | null;
  blessings: string;
  selected_index: number;
  background_url: string | null;
  background_path: string | null;
  created_at: string;
  updated_at: string;
};

function toModel(r: RawRow): PrepareRecord {
  let blessings: string[] = [];
  try {
    const parsed = JSON.parse(r.blessings || '[]');
    if (Array.isArray(parsed)) {
      blessings = parsed.filter((x): x is string => typeof x === 'string');
    }
  } catch {
    blessings = [];
  }
  return {
    id: r.id,
    scene: r.scene === 'holiday' ? 'holiday' : 'contact',
    personId: r.person_id,
    festivalCode: r.festival_code,
    blessings,
    selectedIndex: Number.isFinite(r.selected_index) ? r.selected_index : 0,
    backgroundUrl: r.background_url,
    backgroundPath: r.background_path ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 构造 prepare 表查询用 WHERE（按场景 + 收件人 + 节日，某一项可空）。 */
function lookupClause(scene: PrepareScene, personId: string | null, festivalCode: string | null) {
  return { scene, personId, festivalCode };
}

function conditions(k: PrepareKey): { sql: string; params: string[] } {
  const clauses: string[] = ["scene = ?"];
  const params: string[] = [k.scene];
  if (k.personId == null) {
    clauses.push("person_id IS NULL");
  } else {
    clauses.push("person_id = ?");
    params.push(k.personId);
  }
  if (k.festivalCode == null) {
    clauses.push("festival_code IS NULL");
  } else {
    clauses.push("festival_code = ?");
    params.push(k.festivalCode);
  }
  return { sql: clauses.join(" AND "), params };
}

/**
 * 取某「场景 + 收件人 + 节日」下 updated_at 最新的一条准备记录；没有返回 null。
 * 用于退出再进入时恢复上次的祝福内容。
 */
export async function findPrepare(k: PrepareKey): Promise<PrepareRecord | null> {
  const db = await getDatabase();
  const { sql, params } = conditions(k);
  const row = await db.getFirstAsync<RawRow>(
    `SELECT * FROM prepare WHERE ${sql} ORDER BY updated_at DESC LIMIT 1`,
    ...params,
  );
  return row ? toModel(row) : null;
}

/**
 * 保存祝福结果（幂等）：命中同「场景 + 收件人 + 节日」的最近一条则覆盖更新，
 * 否则新增。返回写入/更新后的记录。
 */
export async function savePrepare(
  k: PrepareKey,
  blessings: string[],
  selectedIndex = 0,
): Promise<PrepareRecord> {
  const now = new Date().toISOString();
  const personId = k.personId ?? null;
  const festivalCode = k.festivalCode ?? null;
  const json = JSON.stringify(blessings);
  const { sql, params } = conditions(lookupClause(k.scene, personId, festivalCode));

  return withWriteTransaction(async (txn) => {
    const row = await txn.getFirstAsync<RawRow>(
      `SELECT * FROM prepare WHERE ${sql} ORDER BY updated_at DESC LIMIT 1`,
      ...params,
    );

    if (row) {
      const existing = toModel(row);
      // 内容没变（只是重新进入页面/切换选中）不推进 updated_at、不入队：
      // 否则本机会以「新时间戳」挡住别台设备刚同步下来的较新祝福内容。
      const contentChanged = JSON.stringify(existing.blessings) !== json;
      if (!contentChanged) {
        if (existing.selectedIndex !== selectedIndex) {
          await txn.runAsync('UPDATE prepare SET selected_index = ? WHERE id = ?', selectedIndex, existing.id);
        }
        return { ...existing, selectedIndex };
      }
      await txn.runAsync(
        `UPDATE prepare SET blessings = ?, selected_index = ?, updated_at = ? WHERE id = ?`,
        json,
        selectedIndex,
        now,
        existing.id,
      );
      await enqueue(txn, 'prepare', existing.id);
      return { ...existing, blessings, selectedIndex, updatedAt: now };
    }

    const id = uuid();
    await txn.runAsync(
      `INSERT INTO prepare (id, scene, person_id, festival_code, blessings, selected_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      k.scene,
      personId,
      festivalCode,
      json,
      selectedIndex,
      now,
      now,
    );
    await enqueue(txn, 'prepare', id);
    return {
      id,
      scene: k.scene,
      personId,
      festivalCode,
      blessings,
      selectedIndex,
      backgroundUrl: null,
      backgroundPath: null,
      createdAt: now,
      updatedAt: now,
    };
  });
}

/**
 * 更新某条准备记录的选中下标（贺卡切换祝福时调用）。
 * 说明：选中下标是本机 UI 状态，不同步、也不入队——否则会把别台设备较新的祝福内容冲掉。
 */
export async function setPrepareSelectedIndex(id: string, selectedIndex: number): Promise<void> {
  const db = await getDatabase();
  // 不写 updated_at：它同时是同步用的 LWW 时间戳，纯 UI 状态不能推进它
  await db.runAsync('UPDATE prepare SET selected_index = ? WHERE id = ?', selectedIndex, id);
}

/**
 * 更新某条准备记录的背景图 URL（贺卡生成背景图后调用）。
 * 同上：背景图地址可能是会过期的签名链接，不同步。
 */
export async function setPrepareBackgroundUrl(id: string, url: string | null): Promise<void> {
  const db = await getDatabase();
  // 同上：背景图地址是本机缓存，不推进同步时间戳
  await db.runAsync('UPDATE prepare SET background_url = ? WHERE id = ?', url, id);
}

/**
 * 记录背景图在云端的存储路径（生成成功后调用）。
 * 与 background_url 不同，这是真实的业务数据：要推进 updated_at 并纳入同步，
 * 这样换机/重装登录后才能取回同一张图。
 */
export async function setPrepareBackgroundPath(id: string, path: string): Promise<void> {
  const now = new Date().toISOString();
  await withWriteTransaction(async (txn) => {
    await txn.runAsync(
      'UPDATE prepare SET background_path = ?, updated_at = ? WHERE id = ?',
      path,
      now,
      id,
    );
    await enqueue(txn, 'prepare', id);
  });
}

/** 按 id 取准备记录；不存在返回 null（贺卡页引用用）。 */
export async function getPrepareById(id: string): Promise<PrepareRecord | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<RawRow>('SELECT * FROM prepare WHERE id = ?', id);
  return row ? toModel(row) : null;
}