// 数据层通用工具：生成主键 UUID（data-model 一.2：主键 TEXT 存 UUID 字符串）。
// 采用 RFC 4122 v4，浏览器环境不保证 crypto.randomUUID，故自行实现回退。

let canUseCrypto = true;
try {
  // RN/Hermes 下 crypto.randomUUID 可能不存在，探测后回退。
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    canUseCrypto = false;
  }
} catch {
  canUseCrypto = false;
}

export function uuid(): string {
  if (canUseCrypto) {
    return crypto.randomUUID();
  }
  // const toString = (n: number, pad: number) => ...
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** FNV-1a 32 位散列（带种子），用于生成确定性 id。 */
function fnv1a(input: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 确定性 UUID（同一种子永远得到同一 id）。
 * 用于「两台设备可能各自生成同一条记录」的场景（如 history）：
 * 用业务键当种子，双方生成相同 id，同步后自然收敛为一行，不会重复。
 */
export function stableUuid(seed: string): string {
  const hex = [0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f]
    .map((s) => fnv1a(seed, s).toString(16).padStart(8, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}