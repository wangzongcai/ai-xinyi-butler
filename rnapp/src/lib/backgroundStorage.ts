// =====================================================================
// 贺卡背景图的云端取回（2026-10-25）
// 桶 card-backgrounds 是私有的，路径为 <uid>/<prepareId>.jpg（见 supabase 迁移）。
// 客户端不保存永久链接：每次打开贺卡时按路径换一个短期签名 URL，
// 结果顺手写回本机 prepare.background_url 作为离线缓存。
// =====================================================================
import { supabase } from '../auth/supabase';

export const BACKGROUND_BUCKET = 'card-backgrounds';
/** 签名有效期：7 天。过期后重新进入贺卡页会自动续签。 */
const SIGNED_TTL_SECONDS = 7 * 24 * 3600;

/** 按存储路径换取带签名的临时访问地址；失败返回 null（页面走降级/重新生成）。 */
export async function signedBackgroundUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BACKGROUND_BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
