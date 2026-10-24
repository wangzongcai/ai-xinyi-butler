// =====================================================================
// trait（特征）Repository
// 依据 data-model 3.3。约束：每对象最多 10 条、每条最多 50 字（数据层校验，
// 数据库亦有 length(content)<=50 的 CHECK 兜底）。外键 person_id 级联删除。
// 未来 Supabase 实现保留同一方法签名。
// =====================================================================
import { getDatabase } from '../db/client';
import { uuid } from './uuid';

export const TRAIT_MAX_PER_PERSON = 10;
export const TRAIT_MAX_LENGTH = 50;

export type Trait = {
  id: string;
  /** 对象 id（外键） */
  personId: string;
  /** 内容：每条最多 50 字 */
  content: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
};

export type NewTrait = {
  personId: string;
  content: string;
};

type RawRow = {
  id: string;
  person_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

function toModel(r: RawRow): Trait {
  return {
    id: r.id,
    personId: r.person_id,
    content: r.content,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 校验特征内容长度（<=50）。超长抛出错误，供表单层提示。 */
export function assertTraitContentValid(content: string): void {
  if (content.length > TRAIT_MAX_LENGTH) {
    throw new Error(`特征每条最多 ${TRAIT_MAX_LENGTH} 字，当前 ${content.length} 字`);
  }
}

/** 新增特征；先校验条数与长度，超限抛错并拒绝写入。 */
export async function createTrait(input: NewTrait): Promise<Trait> {
  assertTraitContentValid(input.content);
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = uuid();
  // 写入前再次计数校验，防止并发/漏校验导致超 10 条
  const countRow = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM trait WHERE person_id = ?',
    input.personId,
  );
  if ((countRow?.c ?? 0) >= TRAIT_MAX_PER_PERSON) {
    throw new Error(`每个对象最多 ${TRAIT_MAX_PER_PERSON} 条特征`);
  }
  await db.runAsync(
    'INSERT INTO trait (id, person_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    id,
    input.personId,
    input.content.trim(),
    now,
    now,
  );
  return {
    id,
    personId: input.personId,
    content: input.content.trim(),
    createdAt: now,
    updatedAt: now,
  };
}

/** 按对象查询全部特征（按创建时间升序） */
export async function listTraitsByPerson(personId: string): Promise<Trait[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RawRow>(
    'SELECT * FROM trait WHERE person_id = ? ORDER BY created_at ASC',
    personId,
  );
  return rows.map(toModel);
}

/** 更新单条特征；校验长度。 */
export async function updateTrait(id: string, content: string): Promise<void> {
  assertTraitContentValid(content);
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE trait SET content = ?, updated_at = ? WHERE id = ?',
    content.trim(),
    now,
    id,
  );
}

/** 删除单条特征 */
export async function deleteTrait(personId: string, id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM trait WHERE id = ? AND person_id = ?', id, personId);
}