// =====================================================================
// 日期计算工具：下一次发生日期（M3-03）
// 依据 spec 全局约定「日期计算规则」：
//   生日/纪念日按「下一次发生日期」计算倒计时；
//   今年的日子已过时，自动指向明年同一天。
// 输出：距今天数。未来 Supabase（M6-07/M6 排期）复用同一工具。
// =====================================================================
import { differenceInCalendarDays } from 'date-fns';

/**
 * 计算某一天距今天的「下一次发生」倒计时天数（不含当天，当天为 0）。
 *
 * 规则：
 *  - 目标日期用「月-日」表示（忽略年份，即周期性的生日/纪念日）。
 *  - 今年对应日期若未到（含今天，今天算 0），返回今年那次的距离。
 *  - 今年对应日期若已过，指向明年同一天再算距离。
 *  - 若目标为 2 月 29 日，非闰年自动落到 2 月 28 日逐日累加。
 *
 * @param month 目标月份 1~12
 * @param day   目标日 1~31
 * @param ref   参考日期（默认今天，本地时区）。通常不传，测试可注入。
 * @returns 距今天数。0 表示今天；负数不可能出现（最新即为今年/明年最近一次）。
 */
export function daysUntilNextOccurrence(
  month: number,
  day: number,
  ref: Date = new Date(),
): number {
  const today = startOfDay(ref);
  const thisYear = today.getFullYear();

  // 本年那天（处理 2/29 非闰年夹回，见 safeDate）
  const thisYearTarget = safeDate(thisYear, month, day);

  // 今年对应日期在今天或之后（含今天，今天为 0）→ 返回今年那次
  if (differenceInCalendarDays(thisYearTarget, today) >= 0) {
    return differenceInCalendarDays(thisYearTarget, today);
  }

  // 今年已过 → 明年同一天
  const nextYearTarget = safeDate(thisYear + 1, month, day);
  return differenceInCalendarDays(nextYearTarget, today);
}

// 存储值 'MM-DD' 的倒计时请用 utils/calendar.ts 的 nextOccurrenceDays，
// 它会在公历/农历之间分派；本文件只保留纯公历的月日计算。

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * 构造年月日；若 day 越界（如 2/30、闰年 2/29 且当年非闰）自动 rollover 到有效日期。
 * 注意：Date 的 day=0 表示上月最后一天，这里用月份+1 配合 0 日技巧来安全取整，
 * 以确保 2/29 在非闰年落到 3/1 而非 2/28（但通常业务上我们期望 2/28）。
 * 因此对 2/29 情形单独打折到 2/28（见下方 month-day clamp）。
 */
function safeDate(year: number, month: number, day: number): Date {
  // 构建当日
  const result = new Date(year, month - 1, day);
  // 若因越界被 Date 自动进位到下月，强制夹回本月最后一天
  if (result.getMonth() !== month - 1) {
    // 本月最后一天 = 下月第 0 天
    return new Date(year, month, 0);
  }
  return result;
}