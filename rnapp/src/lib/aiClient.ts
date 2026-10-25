// =====================================================================
// AI 服务调用层（M7/M8）
// 统一封装对 Supabase Edge Function 的调用：generate-blessings / generate-gifts。
// App 只把「关系 / 特征 / 场景 / 数量」等必要描述发给服务端函数，
// DeepSeek API Key 只存在 Edge Function 环境变量，绝不落到客户端。
// =====================================================================
import { supabase } from '../auth/supabase';
import { isOfflineError, OFFLINE_TIP } from './network';

export type BlessScene = 'birthday' | 'anniversary' | 'festival';

/** 生成祝福语结果。 */
export type BlessingResult = { blessings: string[] };

/** 一条礼物建议。 */
export type GiftSuggest = { name: string; reason: string; keyword: string };

/** 贺卡背景图场景：生日 / 纪念日 / 节日 / 通用联系人。 */
export type CardImageScene = 'birthday' | 'anniversary' | 'festival' | 'contact';

/** 慢速网络下的统一超时提示（具体等待由 supabase-js fetch 控制）。 */

/** 解析 invoke 抛出的错误信息，尽量取出服务端 message。 */
function errorMessage(e: unknown, fallback: string): string {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return fallback;
}

/**
 * 统一成用户看得懂的报错（M11-01）：
 * 断网时按 spec 给「当前无网络，联网后可生成心意内容」，其他情况保留服务端文案。
 */
function toUserError(e: unknown, fallback: string): Error {
  if (isOfflineError(e)) return new Error(OFFLINE_TIP);
  return new Error(errorMessage(e, fallback));
}

/**
 * 生成祝福语。traits 为对方特征列表（联系人场景至少一条，否则函数返回 no_traits）；
 * count 范围内 1~5（默认 3）。
 */
export async function generateBlessings(input: {
  relationship: string;
  traits: string[];
  scene: BlessScene;
  festivalName?: string;
  count: number;
}): Promise<BlessingResult> {
  let result: { data: { blessings?: string[] } | null; error: unknown };
  try {
    result = await supabase.functions.invoke<{ blessings?: string[] }>('generate-blessings', {
      body: {
        relationship: input.relationship,
        traits: input.traits,
        scene: input.scene,
        festivalName: input.festivalName,
        count: input.count,
      },
    });
  } catch (e) {
    // 断网时 invoke 可能直接抛错，而不是返回 error 字段
    throw toUserError(e, '生成祝福失败，请稍后再试');
  }
  const { data, error } = result;
  if (error) throw toUserError(error, '生成祝福失败，请稍后再试');
  return { blessings: (data?.blessings ?? []).filter(Boolean) };
}

/**
 * 生成礼物建议（固定 4 条）。traits 为空且为联系人场景时函数返回 no_traits。
 */
export async function generateGifts(input: {
  relationship: string;
  traits: string[];
  scene: BlessScene;
  festivalName?: string;
}): Promise<GiftSuggest[]> {
  let result: { data: { gifts?: GiftSuggest[] } | null; error: unknown };
  try {
    result = await supabase.functions.invoke<{ gifts?: GiftSuggest[] }>('generate-gifts', {
      body: {
        relationship: input.relationship,
        traits: input.traits,
        scene: input.scene,
        festivalName: input.festivalName,
      },
    });
  } catch (e) {
    throw toUserError(e, '生成礼物建议失败，请稍后再试');
  }
  const { data, error } = result;
  if (error) throw toUserError(error, '生成礼物建议失败，请稍后再试');
  return (data?.gifts ?? []).filter((g) => g && g.name);
}

/** 贺卡背景图生成结果。 */
export type CardImageResult = {
  /** 方舟返回的临时地址：用于本次立即预览（会过期，不要长期保存） */
  imageUrl: string;
  /** 云端存储路径（`<uid>/<prepareId>.jpg`）；转存失败时为 null */
  backgroundPath: string | null;
};

/**
 * 生成贺卡背景图（M9-01）。失败抛错，由贺卡页降级为默认背景色。
 * 只把场景、节日名、纪念日名与关系等必要描述发给服务端，不传祝福原文与联系人姓名。
 * anniversaryName 只用于挑选画面意象（如「结婚纪念日」→ 戒指与香槟）。
 * prepareId 决定云端存储路径：带上它，函数会把图存进 Storage，重装后仍能取回。
 */
export async function generateCardImage(input: {
  scene: CardImageScene;
  prepareId?: string | null;
  festivalCode?: string | null;
  festivalName?: string | null;
  anniversaryName?: string | null;
  relationship?: string;
}): Promise<CardImageResult> {
  let result: { data: { imageUrl?: string; backgroundPath?: string | null } | null; error: unknown };
  try {
    result = await supabase.functions.invoke<{
      imageUrl?: string;
      backgroundPath?: string | null;
    }>('generate-card-image', {
      body: {
        scene: input.scene,
        prepareId: input.prepareId ?? undefined,
        festivalCode: input.festivalCode ?? undefined,
        festivalName: input.festivalName ?? undefined,
        anniversaryName: input.anniversaryName ?? undefined,
        relationship: input.relationship ?? undefined,
      },
    });
  } catch (e) {
    throw toUserError(e, '生成贺卡背景失败，请稍后再试');
  }
  const { data, error } = result;
  if (error) throw toUserError(error, '生成贺卡背景失败，请稍后再试');
  if (!data?.imageUrl) throw new Error('生成贺卡背景失败，请稍后再试');
  return { imageUrl: data.imageUrl, backgroundPath: data.backgroundPath ?? null };
}