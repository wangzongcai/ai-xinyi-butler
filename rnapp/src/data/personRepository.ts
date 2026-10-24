// =====================================================================
// person（心意对象）Repository
// 依据 data-model 3.1。封装增删改查；UI 一律经由本层读写，不直接碰 SQLite。
// 软删除：deleted_at 置时间进回收站；回收站查询按 data-model 规则（30 天）。
// 未来 Supabase 实现保留同一方法签名（data-model 七.5 迁移路径）。
// =====================================================================
import { getDatabase } from '../db/client';
import { uuid } from './uuid';

const RECYCLE_DAYS = 30; // 回收站保留 30 天（data-model 一.4）

export type Person = {
  id: string;
  /** 姓名 */
  name: string;
  /** 与我的关系：用户自由输入 */
  relationship: string;
  /** 生日，YYYY-MM-DD，可空 */
  birthday: string | null;
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
};

type RawRow = {
  id: string;
  name: string;
  relationship: string;
  birthday: string | null;
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
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = uuid();
  const birthday = input.birthday?.trim() ? input.birthday.trim() : null;
  await db.runAsync(
    'INSERT INTO person (id, name, relationship, birthday, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    input.name.trim(),
    input.relationship.trim(),
    birthday,
    now,
    now,
  );
  return { ...toModel({ id, name: input.name.trim(), relationship: input.relationship.trim(), birthday, deleted_at: null, created_at: now, updated_at: now, user_id: null }) };
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
  input: { name?: string; relationship?: string; birthday?: string | null },
): Promise<Person> {
  const db = await getDatabase();
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

  await db.runAsync(
    'UPDATE person SET name = ?, relationship = ?, birthday = ?, updated_at = ? WHERE id = ?',
    name,
    relationship,
    birthday,
    now,
    id,
  );
  return {
    ...existing,
    name,
    relationship,
    birthday,
    updatedAt: now,
  };
}

/**
 * 软删除：deleted_at 置当前时间。对象进入回收站保留 30 天，期间数据完整保留。
 */
export async function softDeletePerson(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE person SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    now,
    now,
    id,
  );
}

/**
 * 恢复回收站对象：清除 deleted_at。
 */
export async function restorePerson(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE person SET deleted_at = NULL, updated_at = ? WHERE id = ?',
    now,
    id,
  );
}

/**
 * 回收站列表：删除时间在 30 天内（含）的对象，附剩余天数。
 * 返回对象 + 剩余保留天数（0 表示最后一天）。
 */
export async function listRecycledPersons(): Promise<
  (Person & { remainingDays: number })[]
> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RawRow>(
    "SELECT * FROM person WHERE deleted_at IS NOT NULL AND deleted_at >= datetime('now', ?) ORDER BY deleted_at DESC",
    `-${RECYCLE_DAYS} days`,
  );
  return rows.map((r) => {
    const ms = new Date(r.deleted_at!).getTime() + RECYCLE_DAYS * 24 * 3600 * 1000;
    const remainingDays = Math.max(0, Math.ceil((ms - Date.now()) / (24 * 3600 * 1000)));
    return { ...toModel(r), remainingDays };
  });
}

/**
 * 彻底清除：物理删除对象及其 anniversary / trait（外键 CASCADE 自动级联），
 * history 的 person_id 由 ON DELETE SET NULL 置空、记录保留。
 */
export async function hardDeletePerson(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM person WHERE id = ?', id);
}

/**
 * 清除已超期 30 天的对象（回收站清理任务调用）。
 * 返回本次彻底清除的对象 id 列表；供级联历史置空确认。
 */
export async function purgeExpiredRecycled(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM person WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)",
    `-${RECYCLE_DAYS} days`,
  );
  const ids = rows.map((r) => r.id);
  for (const id of ids) {
    await hardDeletePerson(id);
  }
  return ids;
}