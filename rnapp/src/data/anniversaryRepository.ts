// =====================================================================
// anniversary（纪念日）Repository
// 依据 data-model 3.2。一个对象可有多个纪念日；外键 person_id 级联删除。
// 未来 Supabase 实现保留同一方法签名。
// =====================================================================
import { getDatabase } from '../db/client';
import { uuid } from './uuid';

export type Anniversary = {
  id: string;
  /** 对象 id（外键） */
  personId: string;
  /** 名称：用户自定义 */
  name: string;
  /** 日期，YYYY-MM-DD */
  date: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
};

export type NewAnniversary = {
  personId: string;
  name: string;
  date: string;
};

type RawRow = {
  id: string;
  person_id: string;
  name: string;
  date: string;
  created_at: string;
  updated_at: string;
};

function toModel(r: RawRow): Anniversary {
  return {
    id: r.id,
    personId: r.person_id,
    name: r.name,
    date: r.date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 新增一个纪念日 */
export async function createAnniversary(input: NewAnniversary): Promise<Anniversary> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = uuid();
  await db.runAsync(
    'INSERT INTO anniversary (id, person_id, name, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    input.personId,
    input.name.trim(),
    input.date,
    now,
    now,
  );
  return {
    id,
    personId: input.personId,
    name: input.name.trim(),
    date: input.date,
    createdAt: now,
    updatedAt: now,
  };
}

/** 按对象查询全部纪念日（按日期升序） */
export async function listAnniversariesByPerson(personId: string): Promise<Anniversary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RawRow>(
    'SELECT * FROM anniversary WHERE person_id = ? ORDER BY date ASC',
    personId,
  );
  return rows.map(toModel);
}

/**
 * 批量替换某对象的纪念日（编辑页整体保存用：先删后插）。
 * 传入最终要保留的纪念日集合（含新增与已有，已有携带 id）。
 */
export async function replaceAnniversaries(
  personId: string,
  anniversaries: { id?: string; name: string; date: string }[],
): Promise<Anniversary[]> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM anniversary WHERE person_id = ?', personId);
  const created: Anniversary[] = [];
  for (const a of anniversaries) {
    if (a.id) {
      // 保留原 id 的已有记录
      const existing = await getAnniversary(personId, a.id);
      if (existing) {
        const now = new Date().toISOString();
        await db.runAsync(
          'UPDATE anniversary SET name = ?, date = ?, updated_at = ? WHERE id = ?',
          a.name.trim(),
          a.date,
          now,
          a.id,
        );
        created.push({ ...existing, name: a.name.trim(), date: a.date, updatedAt: now });
        continue;
      }
      // id 失效则降级为新增
    }
    created.push(await createAnniversary({ personId, name: a.name, date: a.date }));
  }
  return created;
}

/** 单条纪念日查询（需同时给 personId，防止跨对象取到） */
export async function getAnniversary(
  personId: string,
  id: string,
): Promise<Anniversary | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<RawRow>(
    'SELECT * FROM anniversary WHERE id = ? AND person_id = ?',
    id,
    personId,
  );
  return row ? toModel(row) : null;
}

/** 删除单条纪念日 */
export async function deleteAnniversary(personId: string, id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM anniversary WHERE id = ? AND person_id = ?', id, personId);
}