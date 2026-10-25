// =====================================================================
// settings（设置，单行表）Repository
// 依据 data-model 3.4。全表只有一行（id='default'，建表时已写入默认行）。
// 在 data-model 物理列之外，为承载贺卡署名开关与 12 个节日关注状态，
// 追加了两列（决策请见文末「扩展列说明」）：
//   * card_signature       INTEGER  0 关 / 1 开，默认 0（贺卡匿名）
//   * festival_followed    TEXT     存 JSON 对象 { 节日id: true|false }
//   * reminder_hour/minute INTEGER  每天推送时间，默认 9:00（原本固定 9 点，现可自定义）
// 对应 spec 8「贺卡署名默认关闭」与 9「12 个节日默认全部关注、可单独取消」。
// 未来 Supabase 实现保留同一方法签名。
// =====================================================================
import { getDatabase } from '../db/client';
import { withWriteTransaction } from '../db/tx';
import { enqueue } from '../sync/outbox';
import { FESTIVALS } from '../settings/festivals';

export type EcommercePlatform = '淘宝' | '京东';
export type NotificationPermission = 'granted' | 'denied' | 'undetermined' | null;

export type Settings = {
  /** 提前提醒天数：0~30，0 表示只在当天提醒；全局生效 */
  advanceDays: number;
  /** 祝福文案数量：1~5 */
  blessingCount: number;
  /** 电商平台：淘宝 / 京东 */
  ecommercePlatform: EcommercePlatform;
  /** 通知权限状态：granted / denied / undetermined */
  notificationPermission: NotificationPermission;
  /** 贺卡署名开关：false=匿名 */
  cardSignature: boolean;
  /** 12 个节日关注状态：{ 节日id: 是否关注 }（缺省视为关注） */
  followedFestivals: Record<string, boolean>;
  /** 每天推送时间：小时 0~23（按手机本地时区），默认 9 */
  reminderHour: number;
  /** 每天推送时间：分钟 0~59，默认 0 */
  reminderMinute: number;
  /** 礼物区域开关：false=隐藏礼物区且不请求 */
  giftEnabled: boolean;
  /** 贺卡区域开关：false=隐藏贺卡入口且不请求 */
  cardEnabled: boolean;
  /** 贺卡署名文字：可空 */
  signatureText: string | null;
  /** AI 隐私同意时间：非空视为已同意 */
  privacyConsentAt: string | null;
  /** 本地写入时间（含本机专属字段） */
  updatedAt: string;
  /** 可同步字段最近一次修改时间（云同步 LWW 用；仅本地，不上云） */
  syncUpdatedAt: string;
};

type RawRow = {
  id: string;
  advance_days: number;
  blessing_count: number;
  ecommerce_platform: string;
  notification_permission: string | null;
  card_signature: number;
  festival_followed: string;
  reminder_hour: number | null;
  reminder_minute: number | null;
  gift_enabled: number | null;
  card_enabled: number | null;
  signature_text: string | null;
  privacy_consent_at: string | null;
  updated_at: string;
  sync_updated_at: string | null;
};

// 所有节日的 id 清单，用于默认「全部关注」。
const ALL_FESTIVAL_IDS = FESTIVALS.map((f) => f.id);

/** 默认关注状态：全部关注。 */
function defaultFollowedFestivals(): Record<string, boolean> {
  return Object.fromEntries(ALL_FESTIVAL_IDS.map((id) => [id, true]));
}

/** 解析 festival_followed 列，缺省的节日一律视为关注。 */
function parseFollowed(raw: string): Record<string, boolean> {
  let parsed: Record<string, boolean> = {};
  try {
    parsed = JSON.parse(raw || '{}') as Record<string, boolean>;
  } catch {
    parsed = {};
  }
  const out = defaultFollowedFestivals();
  for (const id of ALL_FESTIVAL_IDS) {
    if (id in parsed) out[id] = Boolean(parsed[id]);
  }
  return out;
}

function toModel(r: RawRow): Settings {
  return {
    advanceDays: r.advance_days,
    blessingCount: r.blessing_count,
    ecommercePlatform: r.ecommerce_platform as EcommercePlatform,
    notificationPermission: r.notification_permission as NotificationPermission,
    cardSignature: r.card_signature === 1,
    followedFestivals: parseFollowed(r.festival_followed),
    reminderHour: clampInt(r.reminder_hour, 0, 23, 9),
    reminderMinute: clampInt(r.reminder_minute, 0, 59, 0),
    giftEnabled: r.gift_enabled !== 0,
    cardEnabled: r.card_enabled !== 0,
    signatureText: r.signature_text,
    privacyConsentAt: r.privacy_consent_at,
    updatedAt: r.updated_at,
    syncUpdatedAt: r.sync_updated_at ?? r.updated_at,
  };
}

/** 取整并夹到 [min, max]；空值/非法值回落 fallback。 */
function clampInt(v: number | null | undefined, min: number, max: number, fallback: number): number {
  if (v === null || v === undefined || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

/** 兜底默认值（默认行缺失时使用）。 */
function fallbackSettings(): Settings {
  const now = new Date().toISOString();
  return {
    advanceDays: 3,
    blessingCount: 3,
    ecommercePlatform: '淘宝',
    notificationPermission: null,
    cardSignature: false,
    followedFestivals: defaultFollowedFestivals(),
    reminderHour: 9,
    reminderMinute: 0,
    giftEnabled: true,
    cardEnabled: true,
    signatureText: null,
    privacyConsentAt: null,
    updatedAt: now,
    syncUpdatedAt: now,
  };
}

/** 读取设置；假定默认行已由建表脚本写入，此处做一次兜底保证。 */
export async function getSettings(): Promise<Settings> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<RawRow>("SELECT * FROM settings WHERE id = 'default'");
  return row ? toModel(row) : fallbackSettings();
}

/** 会同步到云端的设置字段；只有改动这些字段才推进 sync_updated_at。 */
const SYNCABLE_FIELDS = [
  'advanceDays',
  'blessingCount',
  'ecommercePlatform',
  'cardSignature',
  'followedFestivals',
  'reminderHour',
  'reminderMinute',
  'giftEnabled',
  'cardEnabled',
  'signatureText',
] as const;

/**
 * 局部更新设置（只更新传入的字段）。options 里每项可选。
 * updated_at 每次都刷新；sync_updated_at 只在改到可同步字段时推进——
 * 否则「启动时同步通知权限」这类本机写入会把云端设置误判成本地更新而覆盖掉。
 */
export async function updateSettings(options: {
  advanceDays?: number;
  blessingCount?: number;
  ecommercePlatform?: EcommercePlatform;
  notificationPermission?: NotificationPermission;
  cardSignature?: boolean;
  followedFestivals?: Record<string, boolean>;
  reminderHour?: number;
  reminderMinute?: number;
  giftEnabled?: boolean;
  cardEnabled?: boolean;
  signatureText?: string | null;
  privacyConsentAt?: string | null;
}): Promise<Settings> {
  const now = new Date().toISOString();
  const touchingSync = SYNCABLE_FIELDS.some((key) => options[key] !== undefined);
  return withWriteTransaction(async (txn) => {
    const row = await txn.getFirstAsync<RawRow>("SELECT * FROM settings WHERE id = 'default'");
    const current = row ? toModel(row) : fallbackSettings();

    const advanceDays =
      options.advanceDays !== undefined ? Math.round(options.advanceDays) : current.advanceDays;
    const blessingCount =
      options.blessingCount !== undefined
        ? Math.round(options.blessingCount)
        : current.blessingCount;
    const ecommercePlatform =
      options.ecommercePlatform !== undefined
        ? options.ecommercePlatform
        : current.ecommercePlatform;
    const notificationPermission =
      options.notificationPermission !== undefined
        ? options.notificationPermission
        : current.notificationPermission;
    const cardSignature =
      options.cardSignature !== undefined ? options.cardSignature : current.cardSignature;
    const followed = options.followedFestivals
      ? { ...current.followedFestivals, ...options.followedFestivals }
      : current.followedFestivals;
    const reminderHour = clampInt(options.reminderHour ?? current.reminderHour, 0, 23, 9);
    const reminderMinute = clampInt(options.reminderMinute ?? current.reminderMinute, 0, 59, 0);
    const giftEnabled =
      options.giftEnabled !== undefined ? options.giftEnabled : current.giftEnabled;
    const cardEnabled =
      options.cardEnabled !== undefined ? options.cardEnabled : current.cardEnabled;
    const signatureText =
      options.signatureText !== undefined ? options.signatureText : current.signatureText;
    const privacyConsentAt =
      options.privacyConsentAt !== undefined
        ? options.privacyConsentAt
        : current.privacyConsentAt;

    // 只有改到可同步字段时才推进同步时间戳并置脏
    const syncUpdatedAt = touchingSync ? now : current.syncUpdatedAt;

    await txn.runAsync(
      `UPDATE settings SET
         advance_days = ?, blessing_count = ?, ecommerce_platform = ?,
         notification_permission = ?, card_signature = ?, festival_followed = ?,
         reminder_hour = ?, reminder_minute = ?, gift_enabled = ?, card_enabled = ?,
         signature_text = ?, privacy_consent_at = ?, updated_at = ?, sync_updated_at = ?
       WHERE id = 'default'`,
      advanceDays,
      blessingCount,
      ecommercePlatform,
      notificationPermission,
      cardSignature ? 1 : 0,
      JSON.stringify(followed),
      reminderHour,
      reminderMinute,
      giftEnabled ? 1 : 0,
      cardEnabled ? 1 : 0,
      signatureText,
      privacyConsentAt,
      now,
      syncUpdatedAt,
    );
    if (touchingSync) {
      await enqueue(txn, 'settings', 'default');
      // 记下「本机确实改过设置」：重装后为空库时该标记为 0，云端设置才能无条件覆盖默认值
      await txn.runAsync("UPDATE sync_meta SET settings_edited = 1 WHERE id = 'default'");
    }

    return {
      advanceDays,
      blessingCount,
      ecommercePlatform,
      notificationPermission,
      cardSignature,
      followedFestivals: followed,
      reminderHour,
      reminderMinute,
      giftEnabled,
      cardEnabled,
      signatureText,
      privacyConsentAt,
      updatedAt: now,
      syncUpdatedAt,
    };
  });
}

/**
 * 与现有 SettingsContext 类型（ShopPlatform: 'taobao' | 'jd'）的对接辅助。
 * M4-01 把内存态替换为持久化时可据此双向转换。
 */
export function toShopPlatform(p: EcommercePlatform): 'taobao' | 'jd' {
  return p === '京东' ? 'jd' : 'taobao';
}
export function fromShopPlatform(p: 'taobao' | 'jd'): EcommercePlatform {
  return p === 'jd' ? '京东' : '淘宝';
}

// ---------------------------------------------------------------------
// 扩展列说明（供 PM 核对）：
//   data-model 3.4 仅有 advance_days / blessing_count / ecommerce_platform /
//   notification_permission / updated_at 五列。为承载 spec 8「贺卡署名」与
//   spec 9「12 个节日关注状态」这两个（task 指出的）此前内存态、现需持久化的
//   概念，我给 settings 追加了两列：
//     * card_signature    INTEGER 0/1       —— 贺卡署名开关
//     * festival_followed TEXT (JSON)       —— 节日关注状态，存 {id: bool}
//   决策：节日关注状态也放进 settings 单行表（JSON 列），而非独立表，
//   因为它是全局单值配置、量小且常整体读取/改写，单行 JSON 最简单可靠；
//   若未来演变为可独立编辑多行的结构，再拆独立表也无破坏性。
//   其他建议（如 two-factor 之类）第一版不落列。
// ---------------------------------------------------------------------