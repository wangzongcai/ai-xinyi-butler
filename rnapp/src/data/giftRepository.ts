// =====================================================================
// gift_suggestion（礼物建议）Repository（2026-10-25）
// 保存每个「场景 + 收件人 + 节日」最近一批礼物建议，随账号同步。
//
// id 采用确定性字符串「scene|personId|festivalCode|序号」：
// 重新生成时原地覆盖同样的几行，不会每次产生新 id / 新墓碑，
// 多设备并发也只会按槽位各自 LWW，合并结果可预测。
// =====================================================================
import { getDatabase } from '../db/client';
import { withWriteTransaction } from '../db/tx';
import { enqueue } from '../sync/outbox';
import type { GiftSuggest } from '../lib/aiClient';
import type { PrepareKey, PrepareScene } from './prepareRepository';

type RawRow = {
  id: string;
  person_id: string | null;
  scene: string;
  festival_code: string | null;
  name: string;
  reason: string;
  keyword: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** 生成确定性主键；用 '-' 占位空值，避免与真实 id 混淆。 */
function giftId(k: PrepareKey, index: number): string {
  return ['gift', k.scene, k.personId ?? '-', k.festivalCode ?? '-', index].join('|');
}

/** 读取某「场景 + 收件人 + 节日」最近一批礼物建议（按展示顺序）。 */
export async function listGifts(k: PrepareKey): Promise<GiftSuggest[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RawRow>(
    `SELECT * FROM gift_suggestion
      WHERE scene = ? AND person_id IS ? AND festival_code IS ?
      ORDER BY sort_order ASC`,
    k.scene,
    k.personId ?? null,
    k.festivalCode ?? null,
  );
  return rows
    .filter((r) => r.name.trim().length > 0)
    .map((r) => ({ name: r.name, reason: r.reason, keyword: r.keyword }));
}

/**
 * 整批替换某场景的礼物建议（生成成功后调用）。
 * 多余槽位直接删除并入队，服务端会据此写墓碑，其他设备同步后同样只保留这一批。
 */
export async function saveGifts(k: PrepareKey, list: GiftSuggest[]): Promise<void> {
  const now = new Date().toISOString();
  const personId = k.personId ?? null;
  const festivalCode = k.festivalCode ?? null;
  const scene: PrepareScene = k.scene;

  await withWriteTransaction(async (txn) => {
    // 先清掉超出的旧槽位（例如本次只返回 3 条）
    const stale = await txn.getAllAsync<{ id: string; sort_order: number }>(
      `SELECT id, sort_order FROM gift_suggestion
        WHERE scene = ? AND person_id IS ? AND festival_code IS ?`,
      scene,
      personId,
      festivalCode,
    );
    for (const row of stale) {
      if (row.sort_order >= list.length) {
        await txn.runAsync('DELETE FROM gift_suggestion WHERE id = ?', row.id);
        await enqueue(txn, 'gift', row.id);
      }
    }

    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      const id = giftId(k, i);
      await txn.runAsync(
        `INSERT INTO gift_suggestion
           (id, person_id, scene, festival_code, name, reason, keyword, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, reason = excluded.reason, keyword = excluded.keyword,
           sort_order = excluded.sort_order, updated_at = excluded.updated_at`,
        id,
        personId,
        scene,
        festivalCode,
        item.name,
        item.reason ?? '',
        item.keyword ?? '',
        i,
        now,
        now,
      );
      await enqueue(txn, 'gift', id);
    }
  });
}
