// =====================================================================
// anniversary（纪念日）Repository
// 依据 data-model 3.2。一个对象可有多个纪念日；外键 person_id 级联删除。
// 未来 Supabase 实现保留同一方法签名。
// =====================================================================
import { getDatabase } from '../db/client';
import { withWriteTransaction } from '../db/tx';
import { enqueue } from '../sync/outbox';
import { uuid } from './uuid';
import type { CalendarKind } from '../utils/calendar';

export type Anniversary = {
  id: string;
  /** 对象 id（外键） */
  personId: string;
  /** 名称：用户自定义 */
  name: string;
  /** 日期，MM-DD（每年重复） */
  date: string;
  /** 日期的历法：公历 / 农历 */
  calendar: CalendarKind;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
};

export type NewAnniversary = {
  personId: string;
  name: string;
  date: string;
  /** 不传按公历 */
  calendar?: CalendarKind;
};

type RawRow = {
  id: string;
  person_id: string;
  name: string;
  date: string;
  calendar: string | null;
  created_at: string;
  updated_at: string;
};

function toModel(r: RawRow): Anniversary {
  return {
    id: r.id,
    personId: r.person_id,
    name: r.name,
    date: r.date,
    calendar: r.calendar === 'lunar' ? 'lunar' : 'solar',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 新增一个纪念日 */
export async function createAnniversary(input: NewAnniversary): Promise<Anniversary> {
  const now = new Date().toISOString();
  const id = uuid();
  const calendar: CalendarKind = input.calendar === 'lunar' ? 'lunar' : 'solar';
  await withWriteTransaction(async (txn) => {
    await txn.runAsync(
      'INSERT INTO anniversary (id, person_id, name, date, calendar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id,
      input.personId,
      input.name.trim(),
      input.date,
      calendar,
      now,
      now,
    );
    await enqueue(txn, 'anniversary', id);
  });
  return {
    id,
    personId: input.personId,
    name: input.name.trim(),
    date: input.date,
    calendar,
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
 * 批量替换某对象的纪念日（编辑页整体保存）。
 * 采用真 diff：读旧行 → 删除被移除的、更新保留的（**保持原 id**）、插入新增的。
 * 旧实现「先全删再按 id 查」必然查不到，导致每次编辑都换新 id、同步层大量抖动。
 */
export async function replaceAnniversaries(
  personId: string,
  anniversaries: { id?: string; name: string; date: string; calendar?: CalendarKind }[],
): Promise<Anniversary[]> {
  const now = new Date().toISOString();
  return withWriteTransaction(async (txn) => {
    const oldRows = await txn.getAllAsync<RawRow>(
      'SELECT * FROM anniversary WHERE person_id = ?',
      personId,
    );
    const oldById = new Map(oldRows.map((r) => [r.id, r]));

    // 传入项里仍然有效的 id 才是「保留」，其余旧行全部删除
    const keepIds = new Set(
      anniversaries
        .map((a) => a.id)
        .filter((id): id is string => Boolean(id) && oldById.has(id as string)),
    );
    for (const row of oldRows) {
      if (keepIds.has(row.id)) continue;
      await txn.runAsync('DELETE FROM anniversary WHERE id = ?', row.id);
      // 物理删除 → 入队，推送时该行已不存在，会自动转成云端 DELETE
      await enqueue(txn, 'anniversary', row.id);
    }

    const result: Anniversary[] = [];
    for (const a of anniversaries) {
      const name = a.name.trim();
      const calendar: CalendarKind | undefined =
        a.calendar === 'lunar' ? 'lunar' : a.calendar === 'solar' ? 'solar' : undefined;
      const existing = a.id ? oldById.get(a.id) : undefined;

      if (existing) {
        const cal = calendar ?? (existing.calendar === 'lunar' ? 'lunar' : 'solar');
        const changed =
          existing.name !== name ||
          existing.date !== a.date ||
          (existing.calendar === 'lunar' ? 'lunar' : 'solar') !== cal;
        if (!changed) {
          result.push(toModel(existing));
          continue;
        }
        await txn.runAsync(
          'UPDATE anniversary SET name = ?, date = ?, calendar = ?, updated_at = ? WHERE id = ?',
          name,
          a.date,
          cal,
          now,
          existing.id,
        );
        await enqueue(txn, 'anniversary', existing.id);
        result.push({ ...toModel(existing), name, date: a.date, calendar: cal, updatedAt: now });
        continue;
      }

      // id 不存在（新增项或来自其他设备的失效 id）→ 新建
      const id = uuid();
      const cal: CalendarKind = calendar ?? 'solar';
      await txn.runAsync(
        'INSERT INTO anniversary (id, person_id, name, date, calendar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id,
        personId,
        name,
        a.date,
        cal,
        now,
        now,
      );
      await enqueue(txn, 'anniversary', id);
      result.push({
        id,
        personId,
        name,
        date: a.date,
        calendar: cal,
        createdAt: now,
        updatedAt: now,
      });
    }
    return result;
  });
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
  await withWriteTransaction(async (txn) => {
    await txn.runAsync('DELETE FROM anniversary WHERE id = ? AND person_id = ?', id, personId);
    await enqueue(txn, 'anniversary', id);
  });
}