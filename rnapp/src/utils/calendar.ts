// =====================================================================
// 公历 / 农历日期工具
// 生日与纪念日只记「月-日」（MM-DD），每年重复：
//   - 公历：直接按今年/明年同月同日算倒计时（复用 nextOccurrence）。
//   - 农历：用 lunar-typescript 把农历月日换算成今年的公历日期再算。
// 第一版不支持闰月：农历一律按普通月份解释。
// =====================================================================
import { Lunar } from 'lunar-typescript';
import { differenceInCalendarDays } from 'date-fns';
import { daysUntilNextOccurrence } from './nextOccurrence';

export type CalendarKind = 'solar' | 'lunar';

export type MonthDay = { month: number; day: number };

const CALENDAR_LABELS: Record<CalendarKind, string> = {
  solar: '公历',
  lunar: '农历',
};

/** 历法的中文名（界面展示用） */
export function calendarLabel(calendar: CalendarKind): string {
  return CALENDAR_LABELS[calendar];
}

/** 公历两个月固定 30 天的集合 */
const SHORT_MONTHS = [4, 6, 9, 11];

/**
 * 某月的最大天数。不存年份，2 月统一按闰年放行 29 日；
 * 农历每月最多 30 天（某年只有 29 天时由换算函数自动回退）。
 */
export function maxDayInMonth(month: number, calendar: CalendarKind = 'solar'): number {
  if (calendar === 'lunar') return 30;
  if (month === 2) return 29;
  return SHORT_MONTHS.includes(month) ? 30 : 31;
}

export function isValidMonthDay(month: number, day: number, calendar: CalendarKind = 'solar'): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  return day <= maxDayInMonth(month, calendar);
}

/**
 * 解析存储值 'MM-DD'；非法返回 null。
 * 必须带上历法：农历每月都有三十，公历 2 月最多 29 日，
 * 按公历校验会把合法的「农历二月三十」判成非法。
 */
export function parseMonthDay(value: string, calendar: CalendarKind = 'solar'): MonthDay | null {
  const match = /^(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (!isValidMonthDay(month, day, calendar)) return null;
  return { month, day };
}

/** 统一写成补零的 'MM-DD'，保证按字符串排序即按日期排序 */
export function toMonthDayString(month: number, day: number): string {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const LUNAR_MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LUNAR_DAY_NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 农历日的中文写法：初一 … 初十、十一 … 十九、二十、廿一 … 廿九、三十 */
function lunarDayName(day: number): string {
  if (day <= 10) return `初${LUNAR_DAY_NAMES[day - 1]}`;
  if (day < 20) return `十${LUNAR_DAY_NAMES[day - 11]}`;
  if (day === 20) return '二十';
  if (day < 30) return `廿${LUNAR_DAY_NAMES[day - 21]}`;
  return '三十';
}

/** 展示用：公历「5月20日」/ 农历「农历四月十五」 */
export function formatMonthDay(value: string, calendar: CalendarKind = 'solar'): string {
  const md = parseMonthDay(value, calendar);
  if (!md) return value;
  if (calendar === 'lunar') {
    return `农历${LUNAR_MONTH_NAMES[md.month - 1]}月${lunarDayName(md.day)}`;
  }
  return `${md.month}月${md.day}日`;
}

/**
 * 农历月日换算成某农历年的公历日期。
 * 某些农历月只有 29 天：所选日不存在时退到当月最后一天（29）。
 */
function lunarToSolar(year: number, month: number, day: number): Date | null {
  for (let d = Math.min(day, 30); d >= 1; d--) {
    try {
      const lunar = Lunar.fromYmd(year, month, d);
      // fromYmd 对非法日会抛错；这里再校验一次月份未被进位
      if (lunar.getMonth() !== month || lunar.getDay() !== d) continue;
      const solar = lunar.getSolar();
      return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
    } catch {
      // 该农历月没有这一天，继续往前退
    }
  }
  return null;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * 农历月日距今天的「下一次发生」天数。
 * 依次尝试今年与明年的农历年，取第一个未过去的日子。
 */
export function lunarDaysUntil(month: number, day: number, ref: Date = new Date()): number {
  const today = startOfDay(ref);
  const lunarYear = Lunar.fromDate(today).getYear();

  for (let y = lunarYear; y <= lunarYear + 1; y++) {
    const target = lunarToSolar(y, month, day);
    if (!target) continue;
    const diff = differenceInCalendarDays(target, today);
    if (diff >= 0) return diff;
  }
  // 理论上不会到这里；返回一年兜底，避免界面出现异常值
  return 365;
}

/**
 * 存储值 'MM-DD' 距今天的下一次发生天数（0 表示今天）。
 * 非法值返回 0。
 */
export function nextOccurrenceDays(
  value: string,
  calendar: CalendarKind = 'solar',
  ref: Date = new Date(),
): number {
  const md = parseMonthDay(value, calendar);
  if (!md) return 0;
  if (calendar === 'lunar') return lunarDaysUntil(md.month, md.day, ref);
  return daysUntilNextOccurrence(md.month, md.day, ref);
}
