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
  if (lower.includes('invalid login credentials')) {
    return '邮箱或密码不正确';
  }
  if (lower.includes('user already registered')) {
    return '该邮箱已注册，请直接登录';
  }
  if (lower.includes('password should be at least') || lower.includes('weak password')) {
    return '密码至少 6 位，请换一个更安全的密码';
  }
  if (lower.includes('email not confirmed')) {
    return '邮箱尚未确认，请先查收确认邮件';
  }
  if (lower.includes('email address') && lower.includes('invalid')) {
    return '邮箱地址格式不正确';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return '操作太频繁，请稍后再试';
  }
  if (lower.includes('expired')) {
    return '验证码或链接已过期，请重新获取';
  }
  if (lower.includes('invalid') || lower.includes('incorrect')) {
    return '输入的信息不正确，请检查后重试';
  }
  if (lower.includes('signups not allowed')) {
    return '当前项目未开放注册';
  }
  return '登录失败，请稍后再试';
}
