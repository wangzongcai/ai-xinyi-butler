// 内置 12 个节日。日期真正计算在 M5 用农历库落地；这里只承载清单与关注状态。
// type：general 通用节日（不关联对象）；targeted 指向性节日（按关系匹配对象）。
export type FestivalType = 'general' | 'targeted';
export type FestivalKind = 'solar' | 'lunar' | 'rule';

export type Festival = {
  id: string;
  name: string;
  kind: FestivalKind;
  type: FestivalType;
  note?: string;
};

export const FESTIVALS: Festival[] = [
  { id: 'new_year', name: '元旦', kind: 'solar', type: 'general' },
  { id: 'spring_festival', name: '春节', kind: 'lunar', type: 'general' },
  { id: 'lantern', name: '元宵节', kind: 'lunar', type: 'general' },
  { id: 'valentines', name: '情人节', kind: 'solar', type: 'targeted', note: '匹配伴侣' },
  { id: 'womens_day', name: '妇女节', kind: 'solar', type: 'targeted', note: '匹配女性家人' },
  { id: 'mothers_day', name: '母亲节', kind: 'rule', type: 'targeted', note: '匹配母亲/妈妈' },
  { id: 'fathers_day', name: '父亲节', kind: 'rule', type: 'targeted', note: '匹配父亲/爸爸' },
  { id: 'dragon_boat', name: '端午节', kind: 'lunar', type: 'general' },
  { id: 'qixi', name: '七夕', kind: 'lunar', type: 'general' },
  { id: 'mid_autumn', name: '中秋节', kind: 'lunar', type: 'general' },
  { id: 'chongyang', name: '重阳节', kind: 'lunar', type: 'general' },
  { id: 'christmas', name: '圣诞节', kind: 'solar', type: 'general' },
];
