// =====================================================================
// 通用节日「未来 10 年日期表」（数据模型 festival_dates 的内存版）。
// 12 节日 × 10 年 = 120 行，运行时用 festivalDate 计算并缓存为静态结构，
// 供 M6 排期与「近日心意」等场合消费。起始年份从 2026 到 2035。
// =====================================================================
import { FESTIVALS, festivalDate } from '../settings/festivals';

export const FESTIVAL_DATES_START_YEAR = 2026;
export const FESTIVAL_DATES_END_YEAR = 2035;

export type FestivalDateRow = {
  festivalCode: string;
  year: number;
  date: string; // YYYY-MM-DD
};

/** 未来 10 年全部节日日期（内存静态表，一次计算后常驻）。 */
export const FESTIVAL_DATES: FestivalDateRow[] = (() => {
  const rows: FestivalDateRow[] = [];
  for (const f of FESTIVALS) {
    for (let y = FESTIVAL_DATES_START_YEAR; y <= FESTIVAL_DATES_END_YEAR; y++) {
      const date = festivalDate(f.id, y);
      if (date) rows.push({ festivalCode: f.id, year: y, date });
    }
  }
  return rows;
})();

/** 按节日 code 取某年份的日期，找不到返回 null。 */
export function festivalDateByYear(festivalCode: string, year: number): string | null {
  return FESTIVAL_DATES.find((r) => r.festivalCode === festivalCode && r.year === year)?.date ?? null;
}

/** 按日期（YYYY-MM-DD）查当天全部节日，供「近日/当天」提醒展示。 */
export function festivalsOnDate(date: string): FestivalDateRow[] {
  return FESTIVAL_DATES.filter((r) => r.date === date);
}