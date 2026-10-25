// =====================================================================
// 数据库客户端（expo-sqlite）
// 依据 data-model.md「三、表结构」建库。UI 一律通过 src/data 下的
// Repository 读写，不直接触碰 SQLite；本文件只负责打开数据库与执行建表。
//
// M12 云同步改造：每个账号使用独立数据库文件 xinyi_butler_<uid>，
// 切换账号即切换库文件，天然隔离、不会串号，也不会因切换账号删数据。
// 登录后由 DatabaseGate 调 setActiveUser(uid) 打开对应库；未登录时没有活动库。
// =====================================================================
import * as SQLite from 'expo-sqlite';

// 建表脚本以字符串常量维护，保持单一来源；Metro 不支持 ?raw 导入。
import { SCHEMA_SQL } from './schema';
import { uuid } from '../data/uuid';

/** 升级前的单库名（未绑定账号）。仅用于一次性迁移旧数据。 */
export const LEGACY_DATABASE_NAME = 'xinyi_butler';

/** 账号对应的本地库名。 */
export function dbNameFor(userId: string): string {
  return `xinyi_butler_${userId}`;
}

let activeUserId: string | null = null;
let activeDbName: string | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** 当前活动账号 id；未登录时为 null。 */
export function getActiveUserId(): string | null {
  return activeUserId;
}

/** 当前活动库名；未登录时为 null。 */
export function getActiveDbName(): string | null {
  return activeDbName;
}

/**
 * 切换/打开某账号的本地库。
 * 幂等：同一账号重复调用返回同一连接；换账号时先关闭旧连接再打开新库。
 */
export async function setActiveUser(userId: string): Promise<SQLite.SQLiteDatabase> {
  const name = dbNameFor(userId);
  if (activeDbName === name && dbPromise) return dbPromise;

  await closeActiveDatabase();
  activeUserId = userId;
  activeDbName = name;
  dbPromise = openDatabase(name);
  return dbPromise;
}

/**
 * 退出登录：关闭当前账号库并清空活动账号。
 * 注意：只关闭连接，不删除库文件（spec：退出登录不删除本机数据）。
 */
export async function clearActiveUser(): Promise<void> {
  await closeActiveDatabase();
  activeUserId = null;
  activeDbName = null;
}

async function closeActiveDatabase(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  try {
    const db = await pending;
    await db.closeAsync();
  } catch {
    // 关闭失败不影响后续换库，忽略
  }
}

/**
 * 取得当前账号的数据库连接。
 * 必须先由 DatabaseGate 调 setActiveUser 打开；未登录/未就绪时直接抛错，
 * 避免任何页面误读到「上一个账号」的数据。
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!activeDbName) {
    return Promise.reject(new Error('本地数据库尚未按账号打开'));
  }
  if (!dbPromise) {
    dbPromise = openDatabase(activeDbName);
  }
  return dbPromise;
}

async function openDatabase(name: string): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(name);
  // 以事务执行建表脚本，保证多语句原子性与 settings 默认行写入一起生效。
  await db.withTransactionAsync(async () => {
    await db.execAsync(SCHEMA_SQL);
    await migrate(db);
  });
  // 再次显式开启外键约束（确保连接级生效）。
  await db.execAsync('PRAGMA foreign_keys = ON;');
  return db;
}

/** 判断表里是否已有某列（SQLite 没有 IF NOT EXISTS 形式的 ADD COLUMN）。 */
async function hasColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

/**
 * 轻量迁移（幂等，每次启动都跑）：
 * 生日/纪念日从「YYYY-MM-DD」改为「MM-DD」（每年重复），并补上历法列。
 * 旧库没有历法列时按公历补默认值。
 */
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  if (!(await hasColumn(db, 'person', 'birthday_calendar'))) {
    await db.execAsync(
      "ALTER TABLE person ADD COLUMN birthday_calendar TEXT NOT NULL DEFAULT 'solar'",
    );
  }
  if (!(await hasColumn(db, 'anniversary', 'calendar'))) {
    await db.execAsync(
      "ALTER TABLE anniversary ADD COLUMN calendar TEXT NOT NULL DEFAULT 'solar'",
    );
  }
  // 推送时间改为可自定义（默认 09:00）：老库补两列
  if (!(await hasColumn(db, 'settings', 'reminder_hour'))) {
    await db.execAsync('ALTER TABLE settings ADD COLUMN reminder_hour INTEGER NOT NULL DEFAULT 9');
  }
  if (!(await hasColumn(db, 'settings', 'reminder_minute'))) {
    await db.execAsync(
      'ALTER TABLE settings ADD COLUMN reminder_minute INTEGER NOT NULL DEFAULT 0',
    );
  }
  // M7/M8 内容开关与署名/隐私字段（默认开 / 可空）：老库幂等补列
  if (!(await hasColumn(db, 'settings', 'gift_enabled'))) {
    await db.execAsync('ALTER TABLE settings ADD COLUMN gift_enabled INTEGER NOT NULL DEFAULT 1');
  }
  if (!(await hasColumn(db, 'settings', 'card_enabled'))) {
    await db.execAsync('ALTER TABLE settings ADD COLUMN card_enabled INTEGER NOT NULL DEFAULT 1');
  }
  if (!(await hasColumn(db, 'settings', 'signature_text'))) {
    await db.execAsync('ALTER TABLE settings ADD COLUMN signature_text TEXT');
  }
  if (!(await hasColumn(db, 'settings', 'privacy_consent_at'))) {
    await db.execAsync('ALTER TABLE settings ADD COLUMN privacy_consent_at TEXT');
  }
  // M12：settings 增加「可同步字段最近修改时间」（仅本地）
  if (!(await hasColumn(db, 'settings', 'sync_updated_at'))) {
    await db.execAsync('ALTER TABLE settings ADD COLUMN sync_updated_at TEXT');
    // 老库整体视为已同步：用现有 updated_at 兜底，避免首次同步把默认设置判成新写入
    await db.execAsync(
      "UPDATE settings SET sync_updated_at = COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE sync_updated_at IS NULL",
    );
  }
  // 同步元数据默认行（device_id 首次生成后固定，随推送上报云端识别自身写入）
  await db.runAsync("INSERT OR IGNORE INTO sync_meta (id, device_id) VALUES ('default', ?)", uuid());

  // M12 修复：重装后云端设置被本机默认值压制的标记位（0 = 本机从未改过设置）
  if (!(await hasColumn(db, 'sync_meta', 'settings_edited'))) {
    await db.execAsync(
      'ALTER TABLE sync_meta ADD COLUMN settings_edited INTEGER NOT NULL DEFAULT 0',
    );
  }
  // 礼物建议持久化（老库建表）：结构与 schema.ts 中的定义保持一致
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS gift_suggestion (
       id TEXT PRIMARY KEY,
       person_id TEXT REFERENCES person (id) ON DELETE CASCADE,
       scene TEXT NOT NULL CHECK (scene IN ('contact','holiday')),
       festival_code TEXT,
       name TEXT NOT NULL,
       reason TEXT NOT NULL DEFAULT '',
       keyword TEXT NOT NULL DEFAULT '',
       sort_order INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
       updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     )`,
  );
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_gift_lookup ON gift_suggestion (scene, person_id, festival_code, sort_order)',
  );

  // 贺卡背景图上云：prepare 增加云端存储路径（老库补列）
  if (!(await hasColumn(db, 'prepare', 'background_path'))) {
    await db.execAsync('ALTER TABLE prepare ADD COLUMN background_path TEXT');
  }
  // 死信表（老库没有）：永久失败的推送留证据，避免静默丢数据
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS sync_dead_letter (
       seq INTEGER PRIMARY KEY AUTOINCREMENT,
       table_name TEXT NOT NULL,
       row_id TEXT NOT NULL,
       error TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
       UNIQUE (table_name, row_id)
     )`,
  );

  // 只转换仍是完整日期格式的旧数据；已转换的记录不再匹配，重复执行无副作用
  await db.execAsync(
    "UPDATE person SET birthday = substr(birthday, 6, 5) " +
      "WHERE birthday IS NOT NULL AND length(birthday) = 10 AND birthday LIKE '____-__-__'",
  );
  await db.execAsync(
    "UPDATE anniversary SET date = substr(date, 6, 5) " +
      "WHERE length(date) = 10 AND date LIKE '____-__-__'",
  );

  // 生日已并入纪念日：把旧的 person.birthday 转成一条名为「生日」的纪念日，
  // 转完清空该列，避免两处数据并存。带上 length=5 条件保证幂等（转完为空不再匹配）。
  const legacyBirthdays = await db.getAllAsync<{
    id: string;
    birthday: string;
    birthday_calendar: string | null;
  }>(
    'SELECT id, birthday, birthday_calendar FROM person ' +
      'WHERE birthday IS NOT NULL AND length(birthday) = 5',
  );
  for (const row of legacyBirthdays) {
    const existed = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM anniversary WHERE person_id = ? AND name = '生日' LIMIT 1",
      row.id,
    );
    if (!existed) {
      const now = new Date().toISOString();
      await db.runAsync(
        'INSERT INTO anniversary (id, person_id, name, date, calendar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        uuid(),
        row.id,
        '生日',
        row.birthday,
        row.birthday_calendar === 'lunar' ? 'lunar' : 'solar',
        now,
        now,
      );
    }
    await db.runAsync('UPDATE person SET birthday = NULL WHERE id = ?', row.id);
  }
}

// ---------------------------------------------------------------------
// 同步元数据读写
// ---------------------------------------------------------------------

export type BootstrapState = 'unbound' | 'bootstrapping' | 'ready' | 'blocked';

export type SyncMeta = {
  deviceId: string;
  bootstrapState: BootstrapState;
  lastSyncAt: string | null;
  legacyAdopted: boolean;
  /** 本机是否改过可同步设置；false 表示云端设置应无条件覆盖本机默认值 */
  settingsEdited: boolean;
  lastError: string | null;
};

const DEFAULT_META: SyncMeta = {
  deviceId: '',
  bootstrapState: 'unbound',
  lastSyncAt: null,
  legacyAdopted: false,
  settingsEdited: false,
  lastError: null,
};

export async function getSyncMeta(): Promise<SyncMeta> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    device_id: string;
    bootstrap_state: string;
    last_sync_at: string | null;
    legacy_adopted: number;
    settings_edited: number | null;
    last_error: string | null;
  }>("SELECT * FROM sync_meta WHERE id = 'default'");
  if (!row) return { ...DEFAULT_META };
  return {
    deviceId: row.device_id,
    bootstrapState: row.bootstrap_state as BootstrapState,
    lastSyncAt: row.last_sync_at,
    legacyAdopted: row.legacy_adopted === 1,
    settingsEdited: row.settings_edited === 1,
    lastError: row.last_error,
  };
}

/** 局部更新同步元数据；未传的字段保持原值。 */
export async function setSyncMeta(patch: {
  bootstrapState?: BootstrapState;
  lastSyncAt?: string | null;
  legacyAdopted?: boolean;
  settingsEdited?: boolean;
  lastError?: string | null;
}): Promise<void> {
  const db = await getDatabase();
  const current = await getSyncMeta();
  await db.runAsync(
    "UPDATE sync_meta SET bootstrap_state = ?, last_sync_at = ?, legacy_adopted = ?, settings_edited = ?, last_error = ? WHERE id = 'default'",
    patch.bootstrapState ?? current.bootstrapState,
    patch.lastSyncAt !== undefined ? patch.lastSyncAt : current.lastSyncAt,
    (patch.legacyAdopted ?? current.legacyAdopted) ? 1 : 0,
    (patch.settingsEdited ?? current.settingsEdited) ? 1 : 0,
    patch.lastError !== undefined ? patch.lastError : current.lastError,
  );
}

// ---------------------------------------------------------------------
// 旧单库（未绑定账号）迁移
// ---------------------------------------------------------------------

export type LegacySummary = {
  persons: number;
  anniversaries: number;
  traits: number;
  history: number;
  prepares: number;
  settingsTouched: boolean;
};

const EMPTY_LEGACY: LegacySummary = {
  persons: 0,
  anniversaries: 0,
  traits: 0,
  history: 0,
  prepares: 0,
  settingsTouched: false,
};

/**
 * 检查升级前的单库 xinyi_butler 是否还有业务数据。
 * 说明：expo-sqlite 没有「库是否存在」的 API，打开不存在的库会创建空文件，
 * 这里靠「有无 person 表」区分全新安装与真实旧库；空文件不影响任何逻辑。
 */
export async function inspectLegacyDatabase(): Promise<LegacySummary> {
  if (!activeDbName) return { ...EMPTY_LEGACY };
  let legacy: SQLite.SQLiteDatabase | null = null;
  try {
    legacy = await SQLite.openDatabaseAsync(LEGACY_DATABASE_NAME);
    const table = await legacy.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'person'",
    );
    if (!table) return { ...EMPTY_LEGACY };
    const count = async (t: string): Promise<number> => {
      const exists = await legacy!.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        t,
      );
      if (!exists) return 0;
      const row = await legacy!.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM ${t}`);
      return row?.c ?? 0;
    };
    const settingsRow = await legacy.getFirstAsync<{ updated_at: string }>(
      "SELECT updated_at FROM settings WHERE id = 'default'",
    );
    const summary: LegacySummary = {
      persons: await count('person'),
      anniversaries: await count('anniversary'),
      traits: await count('trait'),
      history: await count('history'),
      prepares: await count('prepare'),
      settingsTouched: Boolean(settingsRow?.updated_at),
    };
    return summary;
  } catch {
    return { ...EMPTY_LEGACY };
  } finally {
    try {
      await legacy?.closeAsync();
    } catch {
      // 忽略关闭失败
    }
  }
}

/**
 * 把旧单库的业务数据一次性复制到当前账号库（仅在云端确认无数据时调用）。
 * 保留原有 id 与时间戳，保证迁移后与云端/提醒排期一致。
 * 复制完成后标记 legacy_adopted，旧库文件保留作备份、不再读取。
 */
export async function adoptLegacyDatabase(): Promise<LegacySummary | null> {
  if (!activeDbName) return null;
  const summary = await inspectLegacyDatabase();
  const total =
    summary.persons + summary.anniversaries + summary.traits + summary.history + summary.prepares;
  if (total === 0 && !summary.settingsTouched) return null;

  let legacy: SQLite.SQLiteDatabase | null = null;
  try {
    legacy = await SQLite.openDatabaseAsync(LEGACY_DATABASE_NAME);
    // 旧库先补齐新列/新表，保证读取列齐全
    await legacy.execAsync(SCHEMA_SQL);
    await migrate(legacy);

    const persons = await legacy.getAllAsync<{
      id: string;
      name: string;
      relationship: string;
      birthday: string | null;
      birthday_calendar: string | null;
      deleted_at: string | null;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM person');
    const anniversaries = await legacy.getAllAsync<{
      id: string;
      person_id: string;
      name: string;
      date: string;
      calendar: string | null;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM anniversary');
    const traits = await legacy.getAllAsync<{
      id: string;
      person_id: string;
      content: string;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM trait');
    const history = await legacy.getAllAsync<{
      id: string;
      person_id: string | null;
      name: string;
      date: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM history');
    const prepares = await legacy.getAllAsync<{
      id: string;
      scene: string;
      person_id: string | null;
      festival_code: string | null;
      blessings: string;
      selected_index: number;
      background_url: string | null;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM prepare');
    const settings = await legacy.getFirstAsync<{
      advance_days: number;
      blessing_count: number;
      ecommerce_platform: string;
      card_signature: number;
      festival_followed: string;
      reminder_hour: number;
      reminder_minute: number;
      gift_enabled: number;
      card_enabled: number;
      signature_text: string | null;
      updated_at: string;
    }>("SELECT * FROM settings WHERE id = 'default'");

    const db = await getDatabase();
    let result: LegacySummary | null = null;
    await db.withExclusiveTransactionAsync(async (txn) => {
      // 事务走新连接，外键约束需单独开启
      await txn.execAsync('PRAGMA foreign_keys = ON;');
      // 先 person，再子表（外键依赖）
      for (const p of persons) {
        await txn.runAsync(
          `INSERT OR IGNORE INTO person
             (id, name, relationship, birthday, birthday_calendar, deleted_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          p.id,
          p.name,
          p.relationship,
          p.birthday,
          p.birthday_calendar === 'lunar' ? 'lunar' : 'solar',
          p.deleted_at,
          p.created_at,
          p.updated_at,
        );
      }
      for (const a of anniversaries) {
        await txn.runAsync(
          `INSERT OR IGNORE INTO anniversary (id, person_id, name, date, calendar, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          a.id,
          a.person_id,
          a.name,
          a.date,
          a.calendar === 'lunar' ? 'lunar' : 'solar',
          a.created_at,
          a.updated_at,
        );
      }
      for (const t of traits) {
        await txn.runAsync(
          `INSERT OR IGNORE INTO trait (id, person_id, content, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          t.id,
          t.person_id,
          t.content,
          t.created_at,
          t.updated_at,
        );
      }
      for (const h of history) {
        await txn.runAsync(
          `INSERT OR IGNORE INTO history (id, person_id, name, date, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          h.id,
          h.person_id,
          h.name,
          h.date,
          h.status,
          h.created_at,
          h.updated_at,
        );
      }
      for (const p of prepares) {
        await txn.runAsync(
          `INSERT OR IGNORE INTO prepare
             (id, scene, person_id, festival_code, blessings, selected_index, background_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          p.id,
          p.scene,
          p.person_id,
          p.festival_code,
          p.blessings,
          p.selected_index,
          p.background_url,
          p.created_at,
          p.updated_at,
        );
      }
      if (settings) {
        await txn.runAsync(
          `UPDATE settings SET advance_days = ?, blessing_count = ?, ecommerce_platform = ?,
             card_signature = ?, festival_followed = ?, reminder_hour = ?, reminder_minute = ?,
             gift_enabled = ?, card_enabled = ?, signature_text = ?, updated_at = ?, sync_updated_at = ?
           WHERE id = 'default'`,
          settings.advance_days,
          settings.blessing_count,
          settings.ecommerce_platform,
          settings.card_signature,
          settings.festival_followed,
          settings.reminder_hour,
          settings.reminder_minute,
          settings.gift_enabled,
          settings.card_enabled,
          settings.signature_text,
          settings.updated_at,
          settings.updated_at,
        );
      }
      // 旧库有设置说明用户改过，标记 settings_edited，避免把用户的设置在首次同步时被云端覆盖
      await txn.runAsync(
        "UPDATE sync_meta SET legacy_adopted = 1, settings_edited = ? WHERE id = 'default'",
        settings ? 1 : 0,
      );
      result = {
        ...summary,
        persons: persons.length,
        anniversaries: anniversaries.length,
        traits: traits.length,
        history: history.length,
        prepares: prepares.length,
        settingsTouched: Boolean(settings),
      };
    });
    return result;
  } catch {
    return null;
  } finally {
    try {
      await legacy?.closeAsync();
    } catch {
      // 忽略关闭失败
    }
  }
}

/**
 * 供 App 启动时初始化数据库。登录后由 DatabaseGate 调 setActiveUser 后再使用。
 */
export async function initDatabase(): Promise<void> {
  await getDatabase();
}

// 供 Repo 复用的数据类型声明（对应 expo-sqlite 查询结果）。
export type { SQLiteDatabase } from 'expo-sqlite';
