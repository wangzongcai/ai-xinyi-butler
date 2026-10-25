// =====================================================================
// 写事务工具（M12）
// 写库 + 入同步队列必须原子完成，否则崩溃会留下「本地已改、云端不知道」的数据。
// withExclusiveTransactionAsync 会另开一条连接（独立事务），因此：
//   * 事务内所有读写必须用回调里的 txn，不能用 getDatabase()；
//   * 外键约束是连接级的，新连接默认关闭，必须在事务开头显式打开。
//
// 2026-10-25：补「database is locked」重试。
// 独占事务是另一条连接拿 EXCLUSIVE 锁，两个写事务撞在一起时 SQLite 会立即返回
// BUSY（事务连接上也没有 busy_timeout），表现为日志里一条未捕获的
// `NativeDatabase.prepareAsync ... database is locked`，随后页面读库卡住。
// 写事务都是幂等的（失败即整体回滚），所以撞锁时等一下重跑是安全的。
// =====================================================================
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from './client';

/** SQLite 的锁冲突错误：换条连接重试即可，不属于业务失败。 */
function isLockedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return /database is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(msg);
}

const RETRY_DELAYS_MS = [60, 180, 400];

/**
 * 在独占写事务中执行任务，返回任务结果。
 * 说明：expo-sqlite 的 withExclusiveTransactionAsync 不透传返回值，这里用闭包带出。
 */
export async function withWriteTransaction<T>(
  task: (txn: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const db = await getDatabase();
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let result: T | undefined;
    try {
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.execAsync('PRAGMA foreign_keys = ON;');
        result = await task(txn);
      });
      return result as T;
    } catch (e) {
      lastError = e;
      // 只有锁冲突才重试；业务错误（约束、语法等）原样上抛
      if (!isLockedError(e) || attempt === RETRY_DELAYS_MS.length) break;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}
