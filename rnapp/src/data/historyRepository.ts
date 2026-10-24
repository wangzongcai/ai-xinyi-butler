// =====================================================================
// history（心意记录）Repository
// 依据 data-model 3.5。三态：未送 / 已送 / 已过期（默认未送）。
// 一日子一记录：由唯一索引 uq_history_person_name(person_id, name) 保证，
// 写入时对冲突做 OR IGNORE 处理，避免重复推送产生重复记录。
// person 物理删除时 person_id 置空、记录永久保留（ON DELETE SET NULL）。
// 未来 Supabase 实现保留同一方法签名。
// =====================================================================
import { getDatabase } from '../db/client';
import { uuid } from './uuid';

export type HistoryStatus = '未送' | '已送' | '已过期';

export type HistoryRecord = {
  id: string;
  /** 对象 id（外键）；对象被彻底清除后可为 null */
  personId: string | null;
  /** 日子名称：如「2026 年妈妈生日」 */
  name: string;
  /** 该日子的发生日期，YYYY-MM-DD */
  date: string;
  /** 状态 */
  status: HistoryStatus;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
};

export type NewHistory = {
  personId: string;
  name: string;
  date: string;
};

type RawRow = {
  id: string;
  person_id: string | null;
  name: string;
  date: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function toModel(r: RawRow): HistoryRecord {
  return {
    id: r.id,
    personId: r.person_id,
    name: r.name,
    date: r.date,
    status: r.status as HistoryStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * 写入一条「未送」心愿记录（幂等，一日子一记录）。
 * 同一 person 下若已存在同名日子，则不重复插入并返回已有记录；
 * 首次写入则新增。返回最终生效的那条记录。
 */
export async function upsertHistory(input: NewHistory): Promise<HistoryRecord> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = uuid();
  // 唯一索引冲突时 OR IGNORE 跳过，随后查询返回已有行
  await db.runAsync(
    'INSERT OR IGNORE INTO history (id, person_id, name, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    input.personId,
    input.name,
    input.date,
    now,
    now,
  );
  const row = await db.getFirstAsync<RawRow>(
    'SELECT * FROM history WHERE person_id = ? AND name = ?',
    input.personId,
    input.name,
  );
  return toModel(row ?? { id, person_id: input.personId, name: input.name, date: input.date, status: '未送', created_at: now, updated_at: now });
}

/**
 * 历史记录列表：按日期倒序（最近在前）。
 * 可选按状态筛选（全部 / 未送 / 已送 / 已过期）。
 */
export async function listHistory(status?: HistoryStatus): Promise<HistoryRecord[]> {
  const db = await getDatabase();
  const rows = status
    ? await db.getAllAsync<RawRow>(
        'SELECT * FROM history WHERE status = ? ORDER BY date DESC, created_at DESC',
        status,
      )
    : await db.getAllAsync<RawRow>(
        'SELECT * FROM history ORDER BY date DESC, created_at DESC',
      );
  return rows.map(toModel);
}

/** 按对象查询历史（如对象详情页展示其心意记录）。 */
export async function listHistoryByPerson(personId: string): Promise<HistoryRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RawRow>(
    'SELECT * FROM history WHERE person_id = ? ORDER BY date DESC, created_at DESC',
    personId,
  );
  return rows.map(toModel);
}

/** 标记单条记录状态（如「已送」）。 */
export async function updateHistoryStatus(id: string, status: HistoryStatus): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync('UPDATE history SET status = ?, updated_at = ? WHERE id = ?', status, now, id);
}

/**
 * 自动标记「已过期」：把日期已过、状态仍为「未送」的记录置为「已过期」。
 * 返回被更新条数。M10-03 在 App 启动或浏览记录时调用。
 */
export async function markOverdueAsExpired(today?: string): Promise<number> {
  const db = await getDatabase();
  const nowDate = today ?? new Date().toISOString().slice(0, 10);
  const res = await db.runAsync(
    "UPDATE history SET status = '已过期' WHERE status = '未送' AND date < ?",
    nowDate,
  );
  return res.changes ?? 0;
}

/** 删除单条记录。 */
export async function deleteHistory(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM history WHERE id = ?', id);
}