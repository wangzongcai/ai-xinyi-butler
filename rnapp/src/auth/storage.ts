import * as SecureStore from 'expo-secure-store';

// Supabase 的会话 JSON 经常超过 Android SecureStore 单值 2048 字节的上限，
// 这里把值切成多段分别存储，读取时再拼回去，避免令牌保存失败。
const CHUNK_SIZE = 1500;

const countKey = (key: string) => `${key}__chunks`;
const chunkKey = (key: string, index: number) => `${key}__${index}`;

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const countRaw = await SecureStore.getItemAsync(countKey(key));
    if (countRaw == null) {
      // 兼容早期直接整段写入的情况
      return SecureStore.getItemAsync(key);
    }

    const count = Number(countRaw);
    if (!Number.isFinite(count) || count <= 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const prevCountRaw = await SecureStore.getItemAsync(countKey(key));
    const prevCount = Number(prevCountRaw ?? 0);
    const chunks = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));

    for (let i = 0; i < chunks; i += 1) {
      const part = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await SecureStore.setItemAsync(chunkKey(key, i), part);
    }
    // 新值比旧值短时，清掉多余的分段
    for (let i = chunks; i < prevCount; i += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    }
    await SecureStore.setItemAsync(countKey(key), String(chunks));
  },

  async removeItem(key: string): Promise<void> {
    const countRaw = await SecureStore.getItemAsync(countKey(key));
    const count = Number(countRaw ?? 0);
    for (let i = 0; i < count; i += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    }
    await SecureStore.deleteItemAsync(countKey(key));
    await SecureStore.deleteItemAsync(key);
  },
};
