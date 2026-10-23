import type { User } from '@supabase/supabase-js';
import type { CachedAccount } from '../data/authCache';

// 邮箱掩码：只露出前两位，如 wangzongcai0103@gmail.com → wa***@gmail.com
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${domain}`;
}

// 手机号掩码：去掉国家码后保留前三位与后四位，如 +8613812345678 → 138****5678
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('86') && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length >= 7) return `${local.slice(0, 3)}****${local.slice(-4)}`;
  return phone;
}

export function providerLabel(provider: string): string {
  switch (provider) {
    case 'phone':
      return '手机号';
    case 'email':
      return '邮箱';
    case 'wechat':
      return '微信';
    case 'apple':
      return 'Apple';
    default:
      return provider;
  }
}

// 账号头像里用的单字
export function avatarText(provider: string): string {
  switch (provider) {
    case 'phone':
      return '手';
    case 'email':
      return '邮';
    case 'wechat':
      return '微';
    case 'apple':
      return 'A';
    default:
      return '信';
  }
}

// 从 Supabase 用户对象推导设置页要展示的账号信息
export function accountFromUser(user: User): CachedAccount {
  const provider =
    (user.app_metadata?.provider as string | undefined) ??
    (user.phone ? 'phone' : 'email');

  let displayName: string;
  if (user.email) {
    displayName = maskEmail(user.email);
  } else if (user.phone) {
    displayName = maskPhone(user.phone);
  } else {
    const metadata = user.user_metadata ?? {};
    displayName =
      (metadata.name as string | undefined) ??
      (metadata.full_name as string | undefined) ??
      providerLabel(provider);
  }

  return {
    userId: user.id,
    provider,
    displayName,
    loggedInAt: new Date().toISOString(),
  };
}
