// =====================================================================
// 预置通用祝福（M7-12 兜底）
// 生成失败或超时时，按关系类型（家人 / 朋友 / 客户）给出可直接复制的
// 通用祝福作为兜底；无网络提示统一在 M11 处理。
// 关系类型判定：先用关键词粗判，落到家人/朋友/客户三类之一。
// =====================================================================

const GROUPS: Record<'family' | 'friend' | 'customer', string[]> = {
  family: [
    `愿你康健平安，日子热热闹闹。有你在身边，每一天都值得期待。`,
    `不管走到哪里，家永远是你最安心的地方。愿你工作顺遂，常回家看看。`,
    `最平淡的日子里，最是牵挂。愿你把小日子过得有声有色，心里想的都成真。`,
  ],
  friend: [
    `老朋友，好久不见甚是想念。愿你少些烦恼、多些顺利，想做的事都慢慢做成。`,
    `愿你眼里有光、心里有爱，忙碌之余也别忘了照顾好自己。得闲了，咱们聚聚。`,
    `愿你每一次出发都从容，每一次回头都有人在。生活偶尔落雨，也要记得给自己带把伞。`,
  ],
  customer: [
    `感谢一路信任与支持，愿贵司业务蒸蒸日上，合作顺遂、更进一步。`,
    `合作愉快，是彼此的成全。祝您在事业上稳步向前，事事皆顺意。`,
    `愿这份诚意的心意，带去我长久的敬意。期待我们继续携手，互利共赢，前程似锦。`,
  ],
};

type BlessGroup = keyof typeof GROUPS;

/** 按关系描述粗判祝福的分组，落到家人 / 朋友 / 客户。 */
function groupFor(relationship: string): BlessGroup {
  const r = relationship || '';
  if (/客户|领导|老板|经理|合作|贵司|单位|同事/.test(r)) return 'customer';
  if (/朋友|兄弟|姐妹|同学|闺蜜|哥们|老友/.test(r)) return 'friend';
  return 'family'; // 家人 / 其它一律按家人（最稳妥的暖场祝福）
}

/** 按关系返回 3 条预置兜底祝福。 */
export function fallbackBlessings(relationship: string): string[] {
  return GROUPS[groupFor(relationship)];
}

/** 供界面展示当前兜底的分组名。 */
export function fallbackGroupLabel(relationship: string): string {
  const map: Record<BlessGroup, string> = { family: '家人', friend: '朋友', customer: '客户' };
  return map[groupFor(relationship)];
}