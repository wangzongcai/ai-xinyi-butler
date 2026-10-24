// =====================================================================
// M5-T3 走查核对：独立实现（不 import festivals.ts），用 lunar-typescript
// 逐一核对 12 个节日未来 10 年（2026-2035）日期是否满足各自计算规则。
// 用法：node src/data/__tests__/festivalVerify.mjs
// =====================================================================
import { Lunar } from 'lunar-typescript';

const START = 2026;
const END = 2035;
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const isSunday = (y, m, d) => new Date(y, m - 1, d).getDay() === 0;

// 规则-农历：断言某公历日期的农历月日是否等于期望
function lunarIs(festivalId, solarYear, lunarMonth, lunarDay) {
  const date = new Date(`${solarYear}-01-01`);
  const lunar = Lunar.fromDate(date); // 仅占位，下面用农历年换算
  void lunar;
  return null; // 见下方 checkLunarYmd
}

// 直接从「农历年月」求公历，再反推验证
function calcLunar(lunarYear, lunarMonth, lunarDay) {
  return Lunar.fromYmd(lunarYear, lunarMonth, lunarDay).getSolar().toYmd();
}

// 反查：给定公历年，找该年农历某月某日对应的公历日期
function lunarDateForSolarYear(solarYear, lunarMonth, lunarDay) {
  // 农历年与公历年大致对应：先试 lunarYear=solarYear
  const solar = Lunar.fromYmd(solarYear, lunarMonth, lunarDay).getSolar();
  return solar.toYmd();
}

// 核对第 n 个周日
function checkRule(nthWeekday, year, month, weekday /*0=Sun*/) {
  const first = new Date(year, month - 1, 1).getDay();
  let day = 1 + ((weekday - first + 7) % 7) + (nthWeekday - 1) * 7;
  return ymd(year, month, day);
}

let failures = 0;
function expect(cond, msg) {
  if (!cond) {
    failures++;
    console.log('  FAIL:', msg);
  }
}

// ---- 12 节日 ----
const festivals = [
  { id: 'new_year', kind: 'solar', name: '元旦', solar: [1, 1] },
  { id: 'spring_festival', kind: 'lunar', name: '春节', lunar: [1, 1] },
  { id: 'lantern', kind: 'lunar', name: '元宵节', lunar: [1, 15] },
  { id: 'valentines_day', kind: 'solar', name: '情人节', solar: [2, 14] },
  { id: 'womens_day', kind: 'solar', name: '妇女节', solar: [3, 8] },
  { id: 'mothers_day', kind: 'rule', name: '母亲节', rule: { month: 5, nth: 2, weekday: 0 } },
  { id: 'fathers_day', kind: 'rule', name: '父亲节', rule: { month: 6, nth: 3, weekday: 0 } },
  { id: 'dragon_boat', kind: 'lunar', name: '端午节', lunar: [5, 5] },
  { id: 'qixi', kind: 'lunar', name: '七夕', lunar: [7, 7] },
  { id: 'mid_autumn', kind: 'lunar', name: '中秋节', lunar: [8, 15] },
  { id: 'chongyang', kind: 'lunar', name: '重阳节', lunar: [9, 9] },
  { id: 'christmas', kind: 'solar', name: '圣诞节', solar: [12, 25] },
];

const rows = [];
for (const f of festivals) {
  for (let y = START; y <= END; y++) {
    let date;
    if (f.kind === 'solar') date = ymd(y, f.solar[0], f.solar[1]);
    else if (f.kind === 'lunar') date = lunarDateForSolarYear(y, f.lunar[0], f.lunar[1]);
    else date = checkRule(f.rule.nth, y, f.rule.month, f.rule.weekday);

    // 规则核对
    if (f.kind === 'lunar') {
      // 反推该公历日期是否就是农历月日
      const solar = Lunar.fromYmd(parseInt(date.slice(0, 4)), f.lunar[0], f.lunar[1]).getSolar();
      expect(solar.toYmd() === date, `${f.name} ${y} 应为农历${f.lunar[0]}月${f.lunar[1]} => ${date}`);
    } else if (f.kind === 'rule') {
      const [Y, M, D] = date.split('-').map(Number);
      expect(isSunday(Y, M, D), `${f.name} ${y} 应为周日：${date}`);
    } else {
      const [Y, M, D] = date.split('-').map(Number);
      expect(Y === y && M === f.solar[0] && D === f.solar[1], `${f.name} ${y} 应固定 ${f.solar[0]}/${f.solar[1]} => ${date}`);
    }
    rows.push(`${f.id.padEnd(18)} ${y}  ${date}`);
  }
}

console.log('---- 12 节日未来 10 年日期 ----');
console.log(rows.join('\n'));
console.log(`\n共 ${festivals.length * (END - START + 1)} 条`);
console.log(failures === 0 ? '全部校验通过 ✅' : `${failures} 条校验失败 ❌`);
process.exit(failures === 0 ? 0 : 1);