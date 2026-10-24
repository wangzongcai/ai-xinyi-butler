// =====================================================================
// 数据库客户端（expo-sqlite）
// 依据 data-model.md「三、表结构」建库。UI 一律通过 src/data 下的
// Repository 读写，不直接触碰 SQLite；本文件只负责打开数据库与执行建表。
// 注意：expo-sqlite 默认关闭外键约束，建表脚本内已 PRAGMA foreign_keys = ON。
// =====================================================================
import * as SQLite from 'expo-sqlite';

// 建表脚本以字符串常量维护，保持单一来源；Metro 不支持 ?raw 导入。
import { SCHEMA_SQL } from './schema';

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
  });
  // 再次显式开启外键约束（确保连接级生效）。
  await db.execAsync('PRAGMA foreign_keys = ON;');
  return db;
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