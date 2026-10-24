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