// 把 Supabase/网络错误翻译成用户看得懂的中文提示
export function describeAuthError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const lower = message.toLowerCase();

  console.warn('[auth]', message);

  if (lower.includes('network') || lower.includes('fetch')) {
    return '当前无网络，请联网后再登录';
  }
  if (
    lower.includes('sms') ||
    lower.includes('phone provider') ||
    lower.includes('unsupported phone') ||
    lower.includes('phone signups')
  ) {
    return '短信通道尚未开通，请先使用邮箱登录';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return '验证码发送太频繁，请稍后再试';
  }
  if (lower.includes('expired') || lower.includes('invalid') || lower.includes('incorrect')) {
    return '验证码不正确或已过期，请重新获取';
  }
  if (lower.includes('signups not allowed')) {
    return '当前项目未开放注册';
  }
  return '登录失败，请稍后再试';
}
