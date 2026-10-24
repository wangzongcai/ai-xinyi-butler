// =====================================================================
// 数据库客户端（expo-sqlite）
// 依据 data-model.md「三、表结构」建库。UI 一律通过 src/data 下的
// Repository 读写，不直接触碰 SQLite；本文件只负责打开数据库与执行建表。
// 注意：expo-sqlite 默认关闭外键约束，建表脚本内已 PRAGMA foreign_keys = ON。
// =====================================================================
import * as SQLite from 'expo-sqlite';

// 建表脚本以字符串常量维护，保持单一来源；Metro 不支持 ?raw 导入。
import { SCHEMA_SQL } from './schema';
import { uuid } from '../data/uuid';

// 数据库名。改动正式库结构前请升级该常量以触发 reinit，或走迁移脚本。
export const DATABASE_NAME = 'xinyi_butler';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * 打开（并在首次时创建/建表）本地数据库，返回单例。
 * 幂等：重复调用返回同一连接。建表脚本在库首次创建时整段执行。
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabase();
  }
  return dbPromise;
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
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

/**
 * 供 App 启动时初始化数据库。骨架初始化可尽早调用以确保页面读取就绪。
 * 调用方（如根布局）应在进入业务界面前 await 一次 getDatabase()。
 */
export async function initDatabase(): Promise<void> {
  await getDatabase();
}

// 供 Repo 复用的数据类型声明（对应 expo-sqlite 查询结果）。
export type { SQLiteDatabase } from 'expo-sqlite';