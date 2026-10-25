// =====================================================================
// history（心意记录）Repository
// 依据 data-model 3.5。三态：未送 / 已送 / 已过期（默认未送）。
// 一日子一记录：由唯一索引 uq_history_person_name(person_id, name) 保证，
// 写入时对冲突做 OR IGNORE 处理，避免重复推送产生重复记录。
// person 物理删除时 person_id 置空、记录永久保留（ON DELETE SET NULL）。
// 未来 Supabase 实现保留同一方法签名。
// =====================================================================
import { getDatabase } from '../db/client';
import { withWriteTransaction } from '../db/tx';
import { enqueue } from '../sync/outbox';
import { stableUuid } from './uuid';

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
  const now = new Date().toISOString();
  // 确定性 id：同一个人+同一天在两台设备上会算出同一个 id，同步后不会出现两条
  const id = stableUuid(`history:${input.personId}:${input.name}`);
  return withWriteTransaction(async (txn) => {
    // 唯一索引冲突时 OR IGNORE 跳过，随后查询返回已有行
    const res = await txn.runAsync(
      'INSERT OR IGNORE INTO history (id, person_id, name, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      input.personId,
      input.name,
      input.date,
      now,
      now,
    );
    if (res.changes > 0) await enqueue(txn, 'history', id);
    const row = await txn.getFirstAsync<RawRow>(
      'SELECT * FROM history WHERE person_id = ? AND name = ?',
      input.personId,
      input.name,
    );
    return toModel(
      row ?? {
        id,
        person_id: input.personId,
        name: input.name,
        date: input.date,
        status: '未送',
        created_at: now,
        updated_at: now,
      },
    );
  });
}

/** 今天（本地时区）的 YYYY-MM-DD，用于派生「已过期」。 */
function todayString(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 「已过期」不落库，读取时按日期派生：
 * 库里只持久化「未送 / 已送」两种用户意图，避免自动状态与用户「已送」互相覆盖。
 */
function withDerivedStatus(record: HistoryRecord, today: string): HistoryRecord {
  if (record.status === '未送' && record.date < today) {
    return { ...record, status: '已过期' };
  }
  return record;
}

/**
 * 历史记录列表：按日期倒序（最近在前）。
 * 可选按状态筛选（全部 / 未送 / 已送 / 已过期）。
 */
export async function listHistory(status?: HistoryStatus): Promise<HistoryRecord[]> {
  const db = await getDatabase();
  const today = todayString();
  // 筛选条件要把派生的「已过期」一起算上
  let where = '';
  const params: string[] = [];
  if (status === '已过期') {
    where = "WHERE status = '已过期' OR (status = '未送' AND date < ?)";
    params.push(today);
  } else if (status === '未送') {
    where = "WHERE status = '未送' AND date >= ?";
    params.push(today);
  } else if (status) {
    where = 'WHERE status = ?';
    params.push(status);
  }
  const rows = await db.getAllAsync<RawRow>(
    `SELECT * FROM history ${where} ORDER BY date DESC, created_at DESC`,
    ...params,
  );
  return rows.map((r) => withDerivedStatus(toModel(r), today));
}

/** 历史行 + 对象姓名（对象已彻底清除或记录无关联对象时为 null）。 */
export type HistoryRow = HistoryRecord & {
  personName: string | null;
  /**
   * 该对象「之前生成过」的贺卡所在的 prepare 记录 id（没有则为 null）。
   * 历史页只负责打开已有贺卡，不新建、不重新生成。
   */
  prepareId: string | null;
};

/**
 * 历史列表（带对象姓名），供历史页一次查完，不在页面里拼多张表。
 * 用 LEFT JOIN：对象被软删除后仍显示其姓名；对象被彻底清除（person_id 置空）后只显示日子名称。
 * 「已过期」同样按读取时派生，与 listHistory 保持一致。
 */
export async function listHistoryRows(): Promise<HistoryRow[]> {
  const db = await getDatabase();
  const today = todayString();
  // prepare_id：直接取该对象「已经生成过」的那张贺卡，供历史页一键打开。
  // 优先对象页生成的那条（scene = contact），没有再退到该对象最近一条带收件人的准备记录。
  const rows = await db.getAllAsync<
    RawRow & { person_name: string | null; prepare_id: string | null }
  >(
    `SELECT h.*, p.name AS person_name,
            COALESCE(
              (SELECT pr.id FROM prepare pr
                WHERE pr.person_id = h.person_id AND pr.scene = 'contact'
                ORDER BY pr.updated_at DESC LIMIT 1),
              (SELECT pr.id FROM prepare pr
                WHERE pr.person_id = h.person_id
                ORDER BY pr.updated_at DESC LIMIT 1)
            ) AS prepare_id
       FROM history h
       LEFT JOIN person p ON p.id = h.person_id
      ORDER BY h.date DESC, h.created_at DESC`,
  );
  return rows.map((r) => ({
    ...withDerivedStatus(toModel(r), today),
    prepareId: r.prepare_id ?? null,
    personName: r.person_name ?? null,
  }));
}

/** 按对象查询历史（如对象详情页展示其心意记录）。 */
export async function listHistoryByPerson(personId: string): Promise<HistoryRecord[]> {
  const db = await getDatabase();
  const today = todayString();
  const rows = await db.getAllAsync<RawRow>(
    'SELECT * FROM history WHERE person_id = ? ORDER BY date DESC, created_at DESC',
    personId,
  );
  return rows.map((r) => withDerivedStatus(toModel(r), today));
}

/** 标记单条记录状态（如「已送」）。 */
export async function updateHistoryStatus(id: string, status: HistoryStatus): Promise<void> {
  const now = new Date().toISOString();
  await withWriteTransaction(async (txn) => {
    await txn.runAsync('UPDATE history SET status = ?, updated_at = ? WHERE id = ?', status, now, id);
    await enqueue(txn, 'history', id);
  });
}

/** 删除单条记录。 */
export async function deleteHistory(id: string): Promise<void> {
  await withWriteTransaction(async (txn) => {
    await txn.runAsync('DELETE FROM history WHERE id = ?', id);
    await enqueue(txn, 'history', id);
  });
}