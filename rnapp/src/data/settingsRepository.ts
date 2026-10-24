// =====================================================================
// settings（设置，单行表）Repository
// 依据 data-model 3.4。全表只有一行（id='default'，建表时已写入默认行）。
// 在 data-model 物理列之外，为承载贺卡署名开关与 12 个节日关注状态，
// 追加了两列（决策请见文末「扩展列说明」）：
//   * card_signature       INTEGER  0 关 / 1 开，默认 0（贺卡匿名）
//   * festival_followed    TEXT     存 JSON 对象 { 节日id: true|false }
// 对应 spec 8「贺卡署名默认关闭」与 9「12 个节日默认全部关注、可单独取消」。
// 未来 Supabase 实现保留同一方法签名。
// =====================================================================
import { getDatabase } from '../db/client';
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
  updatedAt: string;
};

type RawRow = {
  id: string;
  advance_days: number;
  blessing_count: number;
  ecommerce_platform: string;
  notification_permission: string | null;
  card_signature: number;
  festival_followed: string;
  updated_at: string;
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
    updatedAt: r.updated_at,
  };
}

/** 读取设置；假定默认行已由建表脚本写入，此处做一次兜底保证。 */
export async function getSettings(): Promise<Settings> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<RawRow>("SELECT * FROM settings WHERE id = 'default'");
  if (!row) {
    return {
      advanceDays: 3,
      blessingCount: 3,
      ecommercePlatform: '淘宝',
      notificationPermission: null,
      cardSignature: false,
      followedFestivals: defaultFollowedFestivals(),
      updatedAt: new Date().toISOString(),
    };
  }
  return toModel(row);
}

/**
 * 局部更新设置（只更新传入的字段）。options 里每项可选。
 * 每次更新都会刷 new updated_at。
 */
export async function updateSettings(options: {
  advanceDays?: number;
  blessingCount?: number;
  ecommercePlatform?: EcommercePlatform;
  notificationPermission?: NotificationPermission;
  cardSignature?: boolean;
  followedFestivals?: Record<string, boolean>;
}): Promise<Settings> {
  const db = await getDatabase();
  const current = await getSettings();
  const now = new Date().toISOString();

  const advanceDays =
    options.advanceDays !== undefined ? Math.round(options.advanceDays) : current.advanceDays;
  const blessingCount =
    options.blessingCount !== undefined ? Math.round(options.blessingCount) : current.blessingCount;
  const ecommercePlatform =
    options.ecommercePlatform !== undefined ? options.ecommercePlatform : current.ecommercePlatform;
  const notificationPermission =
    options.notificationPermission !== undefined
      ? options.notificationPermission
      : current.notificationPermission;
  const cardSignature =
    options.cardSignature !== undefined ? options.cardSignature : current.cardSignature;
  const followed = options.followedFestivals
    ? { ...current.followedFestivals, ...options.followedFestivals }
    : current.followedFestivals;

  await db.runAsync(
    `UPDATE settings SET
       advance_days = ?, blessing_count = ?, ecommerce_platform = ?,
       notification_permission = ?, card_signature = ?, festival_followed = ?, updated_at = ?
     WHERE id = 'default'`,
    advanceDays,
    blessingCount,
    ecommercePlatform,
    notificationPermission,
    cardSignature ? 1 : 0,
    JSON.stringify(followed),
    now,
  );

  return {
    advanceDays,
    blessingCount,
    ecommercePlatform,
    notificationPermission,
    cardSignature,
    followedFestivals: followed,
    updatedAt: now,
  };
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