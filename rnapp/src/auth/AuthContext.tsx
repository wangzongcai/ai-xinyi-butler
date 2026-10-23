import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { resetPasswordUrl, supabase } from './supabase';
import { accountFromUser } from './account';
import { clearAuthCache, loadAuthCache, saveAuthCache, type CachedAccount } from '../data/authCache';

type AuthContextValue = {
  /** 当前 Supabase 会话；null 表示未登录 */
  session: Session | null;
  user: User | null;
  /** 本机缓存的展示用账号信息（掩码） */
  account: CachedAccount | null;
  /** 启动时恢复登录态期间为 true */
  loading: boolean;
  /** 邮箱 + 密码登录 */
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** 邮箱 + 密码注册；needsEmailConfirmation 为 true 表示还需先确认邮箱 */
  signUpWithPassword: (
    email: string,
    password: string
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  /** 发送邮箱登录验证码 */
  sendEmailOtp: (email: string) => Promise<void>;
  /** 校验邮箱验证码并建立会话 */
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  /** 发送手机号登录验证码（需服务端已配置短信通道） */
  sendPhoneOtp: (phone: string) => Promise<void>;
  /** 校验手机验证码并建立会话 */
  verifyPhoneOtp: (phone: string, token: string) => Promise<void>;
  /** 发送找回密码邮件；邮件里的链接会打开公网静态页，在那里设置新密码 */
  requestPasswordReset: (email: string) => Promise<void>;
  /** 退出登录：只清除账号身份，不碰本机心意数据 */
  signOut: () => Promise<void>;
  /** 注销账号：调用 delete-account 函数删除服务端身份，再退出登录 */
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<CachedAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // 启动时恢复登录态：令牌由 supabase-js 从安全存储里读回
    (async () => {
      const [sessionResult, cache] = await Promise.all([
        supabase.auth.getSession(),
        loadAuthCache(),
      ]);
      if (!active) return;

      const restored = sessionResult.data.session;
      setSession(restored);
      if (restored?.user) {
        // 缓存仍属于同一个用户才复用，否则按当前用户重新生成
        const nextAccount =
          cache && cache.userId === restored.user.id ? cache : accountFromUser(restored.user);
        setAccount(nextAccount);
        if (!cache || cache.userId !== restored.user.id) void saveAuthCache(nextAccount);
      } else {
        setAccount(null);
      }
      setLoading(false);
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);

      if (event === 'SIGNED_IN' && nextSession?.user) {
        const nextAccount = accountFromUser(nextSession.user);
        setAccount(nextAccount);
        void saveAuthCache(nextAccount);
      } else if (event === 'SIGNED_OUT') {
        setAccount(null);
        void clearAuthCache();
      }
    });

    // App 回到前台时恢复令牌自动刷新，退到后台时暂停，省电
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void supabase.auth.startAutoRefresh();
      } else {
        void supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      active = false;
      authSub.subscription.unsubscribe();
      appStateSub.remove();
    };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    // 项目关闭邮箱确认时会直接返回会话；开启时 session 为空，需要用户先确认邮箱
    return { needsEmailConfirmation: !data.session };
  }, []);

  const sendEmailOtp = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  }, []);

  const verifyEmailOtp = useCallback(async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
  }, []);

  const sendPhoneOtp = useCallback(async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  }, []);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) throw error;
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // 指向公网静态重置页；用户在那里填新密码，改完回 App 登录
      redirectTo: resetPasswordUrl || undefined,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const deleteAccount = useCallback(async () => {
    // Edge Function 会校验当前用户 JWT，只允许删除自己的账号
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) throw error;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      account,
      loading,
      signInWithPassword,
      signUpWithPassword,
      sendEmailOtp,
      verifyEmailOtp,
      sendPhoneOtp,
      verifyPhoneOtp,
      requestPasswordReset,
      signOut,
      deleteAccount,
    }),
    [
      session,
      account,
      loading,
      signInWithPassword,
      signUpWithPassword,
      sendEmailOtp,
      verifyEmailOtp,
      sendPhoneOtp,
      verifyPhoneOtp,
      requestPasswordReset,
      signOut,
      deleteAccount,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
