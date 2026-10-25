// =====================================================================
// 无网络判定（M11-01）
// 不引入新的原生依赖（不加 expo-network / netinfo）：生成请求失败时按错误文案
// 区分「网络不可用」与「服务端出错 / 参数错误」，前者按 spec 功能 5 给固定提示。
// 断网时 fetch 会立刻失败，用户看到的是「当前无网络」，不需要额外轮询网络状态。
// 恢复网络后点「重试」即可正常生成。
// =====================================================================

/** spec 功能 5 规定的固定文案，页面上不要改写 */
export const OFFLINE_TIP = '当前无网络，联网后可生成心意内容';

/**
 * 各运行环境的断网错误文案（小写比较）：
 * - React Native fetch → "Network request failed"
 * - 浏览器 / Deno fetch → "Failed to fetch"
 * - supabase-js Functions 调用 → "Failed to send a request to the Edge Function"
 * - 部分环境 → "fetch failed" / "network error" / offline
 */
const OFFLINE_PATTERNS = [
  'network request failed',
  'failed to fetch',
  'fetch failed',
  'failed to send a request',
  'network error',
  'networkerror',
  'internet connection appears to be offline',
  'econnrefused',
  'enotfound',
];

/** 从任意错误对象里取出可比较的文案（含 cause / name）。 */
function collectText(value: unknown, depth = 0): string {
  if (depth > 3 || value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return '';
  const parts: string[] = [];
  const o = value as { message?: unknown; name?: unknown; cause?: unknown };
  if (typeof o.message === 'string') parts.push(o.message);
  if (typeof o.name === 'string') parts.push(o.name);
  if (o.cause) parts.push(collectText(o.cause, depth + 1));
  return parts.join(' ');
}

/** 判断错误是否属于「没有网络」。 */
export function isOfflineError(error: unknown): boolean {
  const text = collectText(error).toLowerCase();
  if (!text) return false;
  return OFFLINE_PATTERNS.some((p) => text.includes(p));
}
