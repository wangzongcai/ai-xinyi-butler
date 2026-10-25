// =====================================================================
// 贺卡场景（M9-02）
// 负责把 prepare 记录 / 对象信息归一成「背景图场景」与降级配色。
// 视觉风格 Prompt 在 Edge Function 内集中维护（服务端可独立迭代），
// 客户端只决定 scene、festivalCode、festivalName 与降级背景色。
// =====================================================================
import type { CardImageScene } from './aiClient';
import type { PrepareScene } from '../data/prepareRepository';
import { getFestival } from '../settings/festivals';

export type CardSceneContext = {
  scene: CardImageScene;
  festivalCode: string | null;
  festivalName: string | null;
};

/** 各节日（及生日 / 纪念日）的降级背景色：AI 图生成或加载失败时使用。 */
const FESTIVAL_FALLBACK: Record<string, string> = {
  new_year: '#7A3B2E',
  spring_festival: '#8E2F2F',
  lantern: '#A35A2A',
  valentines_day: '#B85E6B',
  womens_day: '#C08A93',
  mothers_day: '#C7848F',
  fathers_day: '#4E6B5C',
  dragon_boat: '#4F7A5A',
  qixi: '#3A3F6B',
  mid_autumn: '#8A6A32',
  chongyang: '#8A6534',
  christmas: '#2F5A44',
};

/**
 * 把 prepare 记录归一成贺卡场景上下文。
 * 节日场景按 festivalCode 取中文名；联系人场景按纪念日名称判断生日 / 纪念日。
 */
export function sceneContextFor(
  scene: PrepareScene,
  festivalCode: string | null,
  anniversaryNames: string[],
): CardSceneContext {
  if (scene === 'holiday') {
    const festival = festivalCode ? getFestival(festivalCode) : undefined;
    return {
      scene: 'festival',
      festivalCode,
      festivalName: festival?.name ?? null,
    };
  }
  return {
    scene: personScene(anniversaryNames),
    festivalCode: null,
    festivalName: null,
  };
}

/** 降级背景色：先按节日代码，再按场景，最后回落山茶色。 */
export function fallbackColorFor(ctx: CardSceneContext): string {
  if (ctx.festivalCode && FESTIVAL_FALLBACK[ctx.festivalCode]) {
    return FESTIVAL_FALLBACK[ctx.festivalCode];
  }
  if (ctx.scene === 'birthday') return '#A85D4E';
  if (ctx.scene === 'anniversary') return '#9A4A58';
  if (ctx.scene === 'festival') return '#8A5A48';
  return '#8C6B63';
}

/** 贺卡顶部的场景短标签（如「生日快乐」「中秋节」）。 */
export function sceneLabel(ctx: CardSceneContext): string {
  if (ctx.scene === 'birthday') return '生日快乐';
  if (ctx.scene === 'anniversary') return '纪念日';
  if (ctx.scene === 'festival') return ctx.festivalName ?? '节日';
  return '心意';
}

/**
 * 对象场景下判断是生日还是纪念日：有名为「生日」的纪念日即按生日处理。
 * 注：生日已并入纪念日（spec 功能 1），所以只能从纪念日名称判断。
 */
export function personScene(anniversaryNames: string[]): 'birthday' | 'anniversary' {
  return anniversaryNames.some((name) => name.includes('生日')) ? 'birthday' : 'anniversary';
}

/** 两个「月-日」之间的一年内最短天数差。 */
function dayDistance(mmdd: string, today: Date): number {
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(mmdd);
  if (!match) return Number.POSITIVE_INFINITY;
  const year = today.getFullYear();
  const target = Date.UTC(year, Number(match[1]) - 1, Number(match[2]));
  const base = Date.UTC(year, today.getMonth(), today.getDate());
  const diff = Math.abs(Math.round((target - base) / 86_400_000));
  return Math.min(diff, 365 - diff);
}

/**
 * 挑选用于背景图 Prompt 的纪念日名称（M9-02）。
 * 生日场景已单独走生日风格，这里排除名称含「生日」的项；
 * 剩下多个纪念日时取离今天最近的那个，让画面贴合用户当下真正在过的日子。
 */
export function pickAnniversaryName(
  anniversaries: { name: string; date: string }[],
  today: Date = new Date(),
): string | null {
  const candidates = anniversaries
    .map((a) => ({ name: a.name.trim(), distance: dayDistance(a.date, today) }))
    .filter((a) => a.name && !a.name.includes('生日'));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0].name;
}
