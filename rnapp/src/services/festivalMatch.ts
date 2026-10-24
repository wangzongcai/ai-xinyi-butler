// =====================================================================
// 指向性节日的关系关键词匹配（M5-T2）。
// 只匹配 type==='targeted' 的 4 个节日；通用节日永不匹配对象。
// 匹配结果仅返回「已关注」的节日 id（followedFestivals 缺省视为关注）。
// relationship 是用户自由输入的文本，用 includes 判断。
// =====================================================================
import { FESTIVALS, type Festival } from '../settings/festivals';

type TargetedFestival = Festival & { type: 'targeted'; matchKeywords: string[] };

/** 指向性节日清单（只有它参与关系匹配）。 */
export const TARGETED_FESTIVALS: TargetedFestival[] = FESTIVALS.filter(
  (f): f is TargetedFestival => f.type === 'targeted' && !!f.matchKeywords,
);

/**
 * 按关系字符串匹配指向性节日，返回命中的已关注节日 id 集合。
 * - relationship：对象关系自由文本。
 * - followedFestivals：{ 节日id: 是否关注 }，未传入或未出现的节日视为「关注」。
 * 通用节日永不进入返回值。
 */
export function festivalMatch(
  relationship: string,
  followedFestivals?: Record<string, boolean>,
): string[] {
  if (!relationship) return [];
  const matched: string[] = [];
  for (const f of TARGETED_FESTIVALS) {
    // 未关注不返回（followedFestivals 缺失或该节日未列出视为关注）
    if (followedFestivals && followedFestivals[f.id] === false) continue;
    if (f.matchKeywords.some((kw) => relationship.includes(kw))) {
      matched.push(f.id);
    }
  }
  return matched;
}