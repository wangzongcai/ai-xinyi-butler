// =====================================================================
// 内置 12 个节日的清单与日期计算（M5 通用节日数据层，被 M6 排期复用）。
// type：general 通用节日（不关联对象）；targeted 指向性节日（按关系匹配对象）。
// kind：solar 公历 / lunar 农历 / rule 规则日（某月第 N 个星期几）。
// 日期真正计算在本文件用 lunar-typescript + date-fns 落地，未来 10 年表见 src/data/festivals.ts。
// =====================================================================
import { Lunar } from 'lunar-typescript';

export type FestivalType = 'general' | 'targeted';
export type FestivalKind = 'solar' | 'lunar' | 'rule';

export type Festival = {
  id: string;
  name: string;
  kind: FestivalKind;
  type: FestivalType;
  note?: string;
  /** 数据模型 festivals.match_keywords：指向性节日用的关系关键词；通用节日为空数组 */
  matchKeywords?: string[];
  /** 数据模型 festivals.calculation_rule：日期表之外的兜底规则文案 */
  calculationRule?: string;
};

export const FESTIVALS: Festival[] = [
  { id: 'new_year', name: '元旦', kind: 'solar', type: 'general', calculationRule: '公历 1 月 1 日' },
  {
    id: 'spring_festival',
    name: '春节',
    kind: 'lunar',
    type: 'general',
    calculationRule: '农历正月初一对应公历日期',
  },
  {
    id: 'lantern',
    name: '元宵节',
    kind: 'lunar',
    type: 'general',
    calculationRule: '农历正月十五对应公历日期',
  },
  {
    id: 'valentines_day',
    name: '情人节',
    kind: 'solar',
    type: 'targeted',
    note: '匹配伴侣',
    matchKeywords: ['伴侣', '对象', '男朋友', '女朋友', '男友', '女友', '老公', '丈夫', '妻子', '老婆', '先生', '爱人', '未婚夫', '未婚妻'],
    calculationRule: '公历 2 月 14 日',
  },
  {
    id: 'womens_day',
    name: '妇女节',
    kind: 'solar',
    type: 'targeted',
    note: '匹配女性家人',
    matchKeywords: ['妈妈', '奶奶', '外婆', '姥姥', '母亲', '姐妹', '姐姐', '妹妹', '女儿', '姑姑', '表姐', '姨', '妻子', '老婆'],
    calculationRule: '公历 3 月 8 日',
  },
  {
    id: 'mothers_day',
    name: '母亲节',
    kind: 'rule',
    type: 'targeted',
    note: '匹配母亲/妈妈',
    matchKeywords: ['母亲', '妈妈', '妈', '妈咪'],
    calculationRule: '5 月第二个周日',
  },
  {
    id: 'fathers_day',
    name: '父亲节',
    kind: 'rule',
    type: 'targeted',
    note: '匹配父亲/爸爸',
    matchKeywords: ['父亲', '爸爸', '爸', '爹'],
    calculationRule: '6 月第三个周日',
  },
  {
    id: 'dragon_boat',
    name: '端午节',
    kind: 'lunar',
    type: 'general',
    calculationRule: '农历五月初五对应公历日期',
  },
  {
    id: 'qixi',
    name: '七夕',
    kind: 'lunar',
    type: 'general',
    calculationRule: '农历七月初七对应公历日期',
  },
  {
    id: 'mid_autumn',
    name: '中秋节',
    kind: 'lunar',
    type: 'general',
    calculationRule: '农历八月十五对应公历日期',
  },
  {
    id: 'chongyang',
    name: '重阳节',
    kind: 'lunar',
    type: 'general',
    calculationRule: '农历九月初九对应公历日期',
  },
  {
    id: 'christmas',
    name: '圣诞节',
    kind: 'solar',
    type: 'general',
    calculationRule: '公历 12 月 25 日',
  },
];

/** 按 id 取节日，找不到返回 undefined。 */
export function getFestival(id: string): Festival | undefined {
  return FESTIVALS.find((f) => f.id === id);
}

/** 补充 0 到一位数日期/月份，输出 YYYY-MM-DD。 */
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function toYmd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * 计算「某月第 n 个星期几」的公历日期（JS 星期：周日=0 … 周六=6）。
 * 例：母亲节 = 5 月第 2 个周日 → weekdayOffset=0, occurrence=2。
 */
function nthWeekdayOfMonth(year: number, month: number, weekdayOffset: number, occurrence: number): string {
  const first = new Date(year, month - 1, 1).getDay(); // 该月 1 号是星期几
  let day = 1 + ((weekdayOffset - first + 7) % 7) + (occurrence - 1) * 7;
  return toYmd(year, month, day);
}

/** 公历节日（按给定 solarYear）的固定日期。 */
function solarCalc(festivalId: string, year: number): string | null {
  switch (festivalId) {
    case 'new_year':
      return toYmd(year, 1, 1);
    case 'valentines_day':
      return toYmd(year, 2, 14);
    case 'womens_day':
      return toYmd(year, 3, 8);
    case 'christmas':
      return toYmd(year, 12, 25);
    default:
      return null;
  }
}

/** 农历节日的公历日期（该农历年即 solarYear 的年，疫情期间节日常落在同年公历）。 */
function lunarCalc(festivalId: string, year: number): string | null {
  const lunarDayMap: Record<string, [number, number]> = {
    spring_festival: [1, 1],
    lantern: [1, 15],
    dragon_boat: [5, 5],
    qixi: [7, 7],
    mid_autumn: [8, 15],
    chongyang: [9, 9],
  };
  const lm = lunarDayMap[festivalId];
  if (!lm) return null;
  const lunar = Lunar.fromYmd(year, lm[0], lm[1]);
  const s = lunar.getSolar();
  return toYmd(s.getYear(), s.getMonth(), s.getDay());
}

/** 规则日节日（某月第 N 个周 X）。 */
function ruleCalc(festivalId: string, year: number): string | null {
  switch (festivalId) {
    case 'mothers_day':
      return nthWeekdayOfMonth(year, 5, 0, 2); // 5 月第二个周日
    case 'fathers_day':
      return nthWeekdayOfMonth(year, 6, 0, 3); // 6 月第三个周日
    default:
      return null;
  }
}

/**
 * 计算某节日在给定年份（solarYear）对应的公历日期 YYYY-MM-DD。
 * 找不到规则返回 null。
 */
export function festivalDate(festivalId: string, year: number): string | null {
  const f = getFestival(festivalId);
  if (!f) return null;
  switch (f.kind) {
    case 'solar':
      return solarCalc(festivalId, year);
    case 'lunar':
      return lunarCalc(festivalId, year);
    case 'rule':
      return ruleCalc(festivalId, year);
    default:
      return null;
  }
}

/** 计算某节日在一整段年份范围（含端点）的日期表，逐行 { festivalCode, year, date }。 */
export function festivalDatesForRange(festivalId: string, startYear: number, endYear: number): Array<{ festivalCode: string; year: number; date: string }> {
  const rows: Array<{ festivalCode: string; year: number; date: string }> = [];
  for (let y = startYear; y <= endYear; y++) {
    const date = festivalDate(festivalId, y);
    if (date) rows.push({ festivalCode: festivalId, year: y, date });
  }
  return rows;
}