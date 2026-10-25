// =====================================================================
// 首次 AI 使用隐私提示（M7-10）
// 首次进入需要 AI 生成的页面时，先征得隐私同意；同意后写入
// settings.privacy_consent_at（非空即视为已同意），之后不再弹出；
// 不同意则不发起任何 AI 生成。
// =====================================================================
import { getSettings, updateSettings } from '../data/settingsRepository';

/**
 * 是否已同意 AI 隐私使用（settings.privacy_consent_at 非空）。
 * 读取失败时返回 true（不打扰用户，页面仍可用）。
 */
export async function hasPrivacyConsent(): Promise<boolean> {
  try {
    const settings = await getSettings();
    return Boolean(settings.privacyConsentAt);
  } catch {
    return true;
  }
}

/** 记录同意时间（当前 UTC ISO），返回是否成功。 */
export async function approvePrivacyConsent(): Promise<boolean> {
  try {
    await updateSettings({ privacyConsentAt: new Date().toISOString() });
    return true;
  } catch {
    return false;
  }
}