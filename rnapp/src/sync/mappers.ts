// =====================================================================
// 云端/本地行映射（M12）
// 集中处理表名对应、类型转换与时间格式，禁止各表各写一套。
//   * 本地 SQLite：布尔存 INTEGER 0/1，JSON 存 TEXT，时间是 ...Z 的 ISO 串
//   * 云端 Postgres：布尔 boolean，JSON 是 jsonb，时间是 timestamptz
// =====================================================================

/** 有墓碑语义的业务表（云端的 prepare 表名叫 prepare_record）。 */
export type SyncTable =
  | 'person'
  | 'anniversary'
  | 'trait'
  | 'history'
  | 'prepare'
  | 'gift';

export const SYNC_TABLES: SyncTable[] = [
  'person',
  'anniversary',
  'trait',
  'history',
  'prepare',
  'gift',
];

/**
 * 逻辑表名 → 本地 SQLite 表名。
 * 注意：逻辑名不等于本地表名——礼物建议在本地叫 gift_suggestion。
 * 拼接本地 SQL 时必须走这张表，直接用逻辑名会报「no such table: gift」。
 */
export const LOCAL_TABLE: Record<SyncTable, string> = {
  person: 'person',
  anniversary: 'anniversary',
  trait: 'trait',
  history: 'history',
  prepare: 'prepare',
  gift: 'gift_suggestion',
};

/** 逻辑表名 → 云端表名 */
export const REMOTE_TABLE: Record<SyncTable, string> = {
  person: 'person',
  anniversary: 'anniversary',
  trait: 'trait',
  history: 'history',
  prepare: 'prepare_record',
  gift: 'gift_suggestion',
};

/** 进入 outbox 的表：5 张业务表 + settings（settings 无墓碑）。 */
export type OutboxTable = SyncTable | 'settings';
export const OUTBOX_TABLES: OutboxTable[] = [...SYNC_TABLES, 'settings'];
export const SETTINGS_TABLE: OutboxTable = 'settings';
export const SETTINGS_ROW_ID = 'default';

export const REMOTE_OF: Record<OutboxTable, string> = {
  ...REMOTE_TABLE,
  settings: 'user_settings',
};

/** 每张业务表要写回本地的列（顺序与 upsert SQL 一致）。 */
export const LOCAL_COLUMNS: Record<SyncTable, string[]> = {
  person: [
    'id',
    'name',
    'relationship',
    'birthday',
    'birthday_calendar',
    'deleted_at',
    'created_at',
    'updated_at',
  ],
  anniversary: ['id', 'person_id', 'name', 'date', 'calendar', 'created_at', 'updated_at'],
  trait: ['id', 'person_id', 'content', 'created_at', 'updated_at'],
  history: ['id', 'person_id', 'name', 'date', 'status', 'created_at', 'updated_at'],
  // prepare 同步祝福内容与云端背景图路径；
  // selected_index / background_url（本机缓存的可过期链接）仍不发不覆盖
  prepare: [
    'id',
    'scene',
    'person_id',
    'festival_code',
    'blessings',
    'background_path',
    'created_at',
    'updated_at',
  ],
  gift: [
    'id',
    'person_id',
    'scene',
    'festival_code',
    'name',
    'reason',
    'keyword',
    'sort_order',
    'created_at',
    'updated_at',
  ],
};

/** 转成 ISO 串（Postgres 返回 +00:00 形式，本地统一用 toISOString 便于比较/显示）。 */
export function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? value : new Date(ms).toISOString();
  }
  return String(value);
}

/** 时间比较统一走毫秒（ISO 字符串跨格式比较会判错）。 */
export function timeMs(value: unknown): number {
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
}

function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** 本地行（snake_case）→ 云端 payload。 */
export function localToRemote(
  table: OutboxTable,
  row: Record<string, unknown>,
  userId: string,
  deviceId: string,
): Record<string, unknown> {
  const base = {
    id: String(row.id),
    user_id: userId,
    origin_device_id: deviceId,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
  switch (table) {
    case 'person':
      return {
        ...base,
        name: row.name,
        relationship: row.relationship,
        birthday: row.birthday ?? null,
        birthday_calendar: row.birthday_calendar ?? 'solar',
        deleted_at: toIso(row.deleted_at),
      };
    case 'anniversary':
      return {
        ...base,
        person_id: row.person_id,
        name: row.name,
        date: row.date,
        calendar: row.calendar ?? 'solar',
      };
    case 'trait':
      return {
        ...base,
        person_id: row.person_id,
        content: row.content,
      };
    case 'history':
      return {
        ...base,
        person_id: row.person_id ?? null,
        name: row.name,
        date: row.date,
        status: row.status,
      };
    case 'prepare':
      return {
        ...base,
        scene: row.scene,
        person_id: row.person_id ?? null,
        festival_code: row.festival_code ?? null,
        blessings: parseJsonArray(row.blessings),
        background_path: (row.background_path as string | null) ?? null,
      };
    case 'gift':
      return {
        ...base,
        person_id: row.person_id ?? null,
        scene: row.scene,
        festival_code: row.festival_code ?? null,
        name: row.name,
        reason: row.reason ?? '',
        keyword: row.keyword ?? '',
        sort_order: Number(row.sort_order ?? 0),
      };
    case 'settings':
      // settings 走 settingsToRemote，这里兜底避免误用
      return base;
  }
}

/** 云端行 → 本地列值（只取 LOCAL_COLUMNS 里的列，忽略 user_id 等同步元数据）。 */
export function remoteToLocal(
  table: SyncTable,
  remote: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of LOCAL_COLUMNS[table]) {
    const value = remote[col];
    if (col === 'created_at' || col === 'updated_at' || col === 'deleted_at') {
      out[col] = toIso(value);
    } else if (col === 'blessings') {
      out[col] = JSON.stringify(parseJsonArray(value));
    } else {
      out[col] = value ?? null;
    }
  }
  return out;
}

/** settings 的可同步列（云端表 user_settings 的列）。 */
export const SETTINGS_SYNC_COLUMNS = [
  'advance_days',
  'blessing_count',
  'ecommerce_platform',
  'card_signature',
  'festival_followed',
  'reminder_hour',
  'reminder_minute',
  'gift_enabled',
  'card_enabled',
  'signature_text',
] as const;

/** 本机行 → 云端 settings payload。同步时间用 sync_updated_at（不受本机专属字段影响）。 */
export function settingsToRemote(
  row: Record<string, unknown>,
  userId: string,
  deviceId: string,
): Record<string, unknown> {
  let followed: Record<string, boolean> = {};
  try {
    followed = JSON.parse(String(row.festival_followed || '{}')) as Record<string, boolean>;
  } catch {
    followed = {};
  }
  return {
    user_id: userId,
    advance_days: Number(row.advance_days ?? 3),
    blessing_count: Number(row.blessing_count ?? 3),
    ecommerce_platform: String(row.ecommerce_platform ?? '淘宝'),
    card_signature: row.card_signature === 1 || row.card_signature === true,
    festival_followed: followed,
    reminder_hour: Number(row.reminder_hour ?? 9),
    reminder_minute: Number(row.reminder_minute ?? 0),
    gift_enabled: row.gift_enabled !== 0 && row.gift_enabled !== false,
    card_enabled: row.card_enabled !== 0 && row.card_enabled !== false,
    signature_text: (row.signature_text as string | null) ?? null,
    updated_at: toIso(row.sync_updated_at) ?? toIso(row.updated_at) ?? new Date().toISOString(),
    origin_device_id: deviceId,
  };
}
