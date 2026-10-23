// Supabase 在 React Native 里依赖完整的 URL 实现，先引入 polyfill
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { secureStorage } from './storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '缺少 Supabase 配置：请在 rnapp/.env.local 中设置 EXPO_PUBLIC_SUPABASE_URL 与 EXPO_PUBLIC_SUPABASE_ANON_KEY'
  );
}

// 重置密码落地页：公网静态托管的重置页（web/index.html）。
// 未配置时留空，此时 Supabase 会回退到项目的 Site URL。
export const resetPasswordUrl = process.env.EXPO_PUBLIC_RESET_PASSWORD_URL;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 令牌存进系统安全存储（iOS Keychain / Android Keystore），并自动分片
    storage: secureStorage,
    persistSession: true,
    autoRefreshToken: true,
    // App 内没有浏览器回调地址，关闭 URL 自动解析，验证码由用户在页面上输入
    detectSessionInUrl: false,
  },
});
