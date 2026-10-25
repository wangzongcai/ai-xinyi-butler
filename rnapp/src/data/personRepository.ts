// =====================================================================
// person（心意对象）Repository
// 依据 data-model 3.1。封装增删改查；UI 一律经由本层读写，不直接碰 SQLite。
// 软删除：deleted_at 置时间进回收站；回收站查询按 data-model 规则（30 天）。
// 未来 Supabase 实现保留同一方法签名（data-model 七.5 迁移路径）。
// =====================================================================
import { getDatabase } from '../db/client';
import { withWriteTransaction } from '../db/tx';
import { enqueue } from '../sync/outbox';
import { uuid } from './uuid';
import type { CalendarKind } from '../utils/calendar';

const RECYCLE_DAYS = 30; // 回收站保留 30 天（data-model 一.4）

export type Person = {
  id: string;
  /** 姓名 */
  name: string;
  /** 与我的关系：用户自由输入 */
  relationship: string;
  /** 生日，MM-DD（每年重复），可空 */
  birthday: string | null;
  /** 生日的历法：公历 / 农历 */
  birthdayCalendar: CalendarKind;
  /** 删除时间 ISO8601；null 表示未删除 */
  deletedAt: string | null;
  /** 创建时间 ISO8601 */
  createdAt: string;
  /** 更新时间 ISO8601 */
  updatedAt: string;
  /** 预留：第一版恒为 null */
  userId: string | null;
};

export type NewPerson = {
  name: string;
  relationship: string;
  birthday?: string | null;
  /** 不传按公历 */
  birthdayCalendar?: CalendarKind;
};

type RawRow = {
  id: string;
  name: string;
  relationship: string;
  birthday: string | null;
  birthday_calendar: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};

function toModel(r: RawRow): Person {
  return {
    id: r.id,
    name: r.name,
    relationship: r.relationship,
    birthday: r.birthday,
    birthdayCalendar: r.birthday_calendar === 'lunar' ? 'lunar' : 'solar',
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    userId: r.user_id,
  };
}

/**
 * 新增对象。只填姓名也可保存（birthday 可空）。返回完整 Person（含 id）。
 */
export async function createPerson(input: NewPerson): Promise<Person> {
  const now = new Date().toISOString();
  const id = uuid();
  const birthday = input.birthday?.trim() ? input.birthday.trim() : null;
  const birthdayCalendar: CalendarKind = input.birthdayCalendar === 'lunar' ? 'lunar' : 'solar';
  // 写库与入同步队列同一事务：崩溃也不会出现「本地有、云端不知道」
  await withWriteTransaction(async (txn) => {
    await txn.runAsync(
      'INSERT INTO person (id, name, relationship, birthday, birthday_calendar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id,
      input.name.trim(),
      input.relationship.trim(),
      birthday,
      birthdayCalendar,
      now,
      now,
    );
    await enqueue(txn, 'person', id);
  });
  return {
    ...toModel({
      id,
      name: input.name.trim(),
      relationship: input.relationship.trim(),
      birthday,
      birthday_calendar: birthdayCalendar,
      deleted_at: null,
      created_at: now,
      updated_at: now,
      user_id: null,
    }),
  };
}

/**
 * 查询单个对象（仅未删除）。不存在或已软删除返回 null。
 */
export async function getPerson(id: string): Promise<Person | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<RawRow>(
    'SELECT * FROM person WHERE id = ? AND deleted_at IS NULL',
    id,
  );
  return row ? toModel(row) : null;
}

/**
 * 全部未删除对象（按更新时间倒序，最近操作靠前）。
 */
export async function listPersons(): Promise<Person[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RawRow>(
    'SELECT * FROM person WHERE deleted_at IS NULL ORDER BY updated_at DESC',
  );
  return rows.map(toModel);
}

/**
 * 更新对象（姓名/关系/生日）。返回更新后的 Person。
 */
export async function updatePerson(
  id: string,
  input: {
    name?: string;
    relationship?: string;
    birthday?: string | null;
    birthdayCalendar?: CalendarKind;
  },
): Promise<Person> {
  const now = new Date().toISOString();
  const existing = await getPerson(id);
  if (!existing) throw new Error('对象不存在或已删除');

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const relationship =
    input.relationship !== undefined ? input.relationship.trim() : existing.relationship;
  const birthday =
    input.birthday !== undefined
      ? input.birthday && input.birthday.trim()
        ? input.birthday.trim()
        : null
      : existing.birthday;
  const birthdayCalendar: CalendarKind =
    input.birthdayCalendar !== undefined
      ? input.birthdayCalendar === 'lunar'
        ? 'lunar'
        : 'solar'
      : existing.birthdayCalendar;

  await withWriteTransaction(async (txn) => {
    await txn.runAsync(
      'UPDATE person SET name = ?, relationship = ?, birthday = ?, birthday_calendar = ?, updated_at = ? WHERE id = ?',
      name,
      relationship,
      birthday,
      birthdayCalendar,
      now,
      id,
    );
    await enqueue(txn, 'person', id);
  });
  return {
    ...existing,
    name,
    relationship,
    birthday,
    birthdayCalendar,
    updatedAt: now,
  };
}

/**
 * 软删除：deleted_at 置当前时间。对象进入回收站保留 30 天，期间数据完整保留。
 */
export async function softDeletePerson(id: string): Promise<void> {
  const now = new Date().toISOString();
  await withWriteTransaction(async (txn) => {
    await txn.runAsync(
      'UPDATE person SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
    );
    await enqueue(txn, 'person', id);
  });
}

/**
 * 恢复回收站对象：清除 deleted_at。
 */
export async function restorePerson(id: string): Promise<void> {
  const now = new Date().toISOString();
  await withWriteTransaction(async (txn) => {
    await txn.runAsync(
      'UPDATE person SET deleted_at = NULL, updated_at = ? WHERE id = ?',
      now,
      id,
    );
    await enqueue(txn, 'person', id);
  });
}

/**
 * 回收站列表：删除时间在 30 天内（含）的对象，附剩余天数。
 * 返回对象 + 剩余保留天数（0 表示最后一天）。
 */
export async function listRecycledPersons(): Promise<
  (Person & { remainingDays: number })[]
> {
  const db = await getDatabase();
  // 时间统一用 ISO 格式（datetime('now') 返回空格分隔，与 deleted_at 的 'T' 比较会错位一天）
  const rows = await db.getAllAsync<RawRow>(
    "SELECT * FROM person WHERE deleted_at IS NOT NULL AND deleted_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now', ?) ORDER BY deleted_at DESC",
    `-${RECYCLE_DAYS} days`,
  );
  return rows.map((r) => {
    const ms = new Date(r.deleted_at!).getTime() + RECYCLE_DAYS * 24 * 3600 * 1000;
    const remainingDays = Math.max(0, Math.ceil((ms - Date.now()) / (24 * 3600 * 1000)));
    return { ...toModel(r), remainingDays };
  });
}

/**
 * 在本地记墓碑：彻底删除是终态，必须在本机也记下来。
 * 否则推送尚未到达云端时，一次 pull 就会把云端旧行重新拉回本地。
 * 子表（anniversary / trait）随外键级联被删，也要各自记墓碑。
 */
async function writeLocalTombstones(
  txn: import('expo-sqlite').SQLiteDatabase,
  personId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const children = await txn.getAllAsync<{ table_name: string; id: string }>(
    `SELECT 'anniversary' AS table_name, id FROM anniversary WHERE person_id = ?
     UNION ALL
     SELECT 'trait' AS table_name, id FROM trait WHERE person_id = ?
     UNION ALL
     SELECT 'gift' AS table_name, id FROM gift_suggestion WHERE person_id = ?`,
    personId,
    personId,
    personId,
  );
  const rows: { table: string; id: string }[] = [
    { table: 'person', id: personId },
    ...children.map((c) => ({ table: c.table_name, id: c.id })),
  ];
  for (const row of rows) {
    await txn.runAsync(
      'INSERT OR IGNORE INTO sync_tombstone (table_name, row_id, deleted_at) VALUES (?, ?, ?)',
      row.table,
      row.id,
      now,
    );
    // 这些行已不存在，未推送的改动也没意义了
    await txn.runAsync(
      'DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ?',
      row.table,
      row.id,
    );
  }
}

/**
 * 彻底清除：物理删除对象及其 anniversary / trait（外键 CASCADE 自动级联），
 * history 的 person_id 由 ON DELETE SET NULL 置空、记录保留。
 */
export async function hardDeletePerson(id: string): Promise<void> {
  await withWriteTransaction(async (txn) => {
    // 先记墓碑（含待级联的子表），再删；服务端 DELETE 会级联并自动为子表写墓碑
    await writeLocalTombstones(txn, id);
    await txn.runAsync('DELETE FROM person WHERE id = ?', id);
    await enqueue(txn, 'person', id);
  });
}

/**
 * 清除已超期 30 天的对象（回收站清理任务调用）。
 * 返回本次彻底清除的对象 id 列表；供级联历史置空确认。
 */
export async function purgeExpiredRecycled(): Promise<string[]> {
  return withWriteTransaction(async (txn) => {
    const rows = await txn.getAllAsync<{ id: string }>(
      "SELECT id FROM person WHERE deleted_at IS NOT NULL AND deleted_at < strftime('%Y-%m-%dT%H:%M:%fZ','now', ?)",
      `-${RECYCLE_DAYS} days`,
    );
    const ids = rows.map((r) => r.id);
    for (const id of ids) {
      await writeLocalTombstones(txn, id);
      await txn.runAsync('DELETE FROM person WHERE id = ?', id);
      await enqueue(txn, 'person', id);
    }
    return ids;
  });
}