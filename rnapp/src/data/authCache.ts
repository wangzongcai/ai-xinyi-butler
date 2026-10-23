import * as SecureStore from 'expo-secure-store';

// 本机账号缓存（对应 data-model 3.8 auth_cache）：
// 只保存用于设置页展示的信息，令牌由 supabase-js 自己通过 secureStorage 保管。
export type CachedAccount = {
  userId: string;
  provider: string; // phone / email / wechat / apple
  displayName: string; // 手机号/邮箱掩码或第三方昵称
  loggedInAt: string; // ISO 8601
};

const CACHE_KEY = 'auth_cache';

export async function saveAuthCache(account: CachedAccount): Promise<void> {
  await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(account));
}

export async function loadAuthCache(): Promise<CachedAccount | null> {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedAccount>;
    if (!parsed?.userId || !parsed?.displayName) return null;
    return {
      userId: parsed.userId,
      provider: parsed.provider ?? 'email',
      displayName: parsed.displayName,
      loggedInAt: parsed.loggedInAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function clearAuthCache(): Promise<void> {
  await SecureStore.deleteItemAsync(CACHE_KEY);
}
