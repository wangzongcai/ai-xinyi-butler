// =====================================================================
// 贺卡默认文案（2026-10-25）
// 贺卡页与对象页的贺卡预览都要用，抽出来保证两处一致：
//   * 默认称呼：关系较短且非商务关系时用「亲爱的 + 关系」，否则直接用姓名；
//   * 贺卡底部日期：生成当天，如「2026年10月25日」。
// =====================================================================
import type { Person } from '../data/personRepository';

/** 默认称呼：关系较短且非商务关系时用「亲爱的 + 关系」，否则直接用姓名。 */
export function defaultSalutation(person: Pick<Person, 'name' | 'relationship'>): string {
  const relationship = person.relationship?.trim() ?? '';
  const businessLike = /客户|同事|领导|老板|合作|商务/.test(relationship);
  if (relationship && !businessLike && relationship.length <= 6) {
    return `亲爱的${relationship}`;
  }
  return person.name;
}

/** 贺卡底部日期：生成当天（YYYY年M月D日）。 */
export function todayText(now: Date = new Date()): string {
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}
