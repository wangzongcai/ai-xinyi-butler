// =====================================================================
// 同步待推送队列（outbox）
// 只记「哪张表的哪一行脏了」，不记 op：推送时读本地当前行，
// 行存在就 upsert、不存在就 delete。这样同一行多次写入只需一条记录。
// 入队必须与业务写入在同一个事务里完成（见 db/tx.ts）。
// =====================================================================
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from '../db/client';
import type { OutboxTable } from './mappers';

export type OutboxItem = {
  seq: number;
  table: OutboxTable;
  rowId: string;
};

/** 入队（在调用方事务内执行）：同一行先去重再插入。 */
export async function enqueue(
  txn: SQLiteDatabase,
  table: OutboxTable,
  rowId: string,
): Promise<void> {
  await txn.runAsync('DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ?', table, rowId);
  await txn.runAsync(
    'INSERT INTO sync_outbox (table_name, row_id) VALUES (?, ?)',
    table,
    rowId,
  );
}

/** 读出全部待推送项（按入队顺序）。 */
export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ seq: number; table_name: string; row_id: string }>(
    'SELECT seq, table_name, row_id FROM sync_outbox ORDER BY seq ASC',
  );
  return rows.map((r) => ({ seq: r.seq, table: r.table_name as OutboxTable, rowId: r.row_id }));
}

/** 待推送条数（同步页展示用）。 */
export async function pendingCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM sync_outbox');
  return row?.c ?? 0;
}

/**
 * 按精确 seq 确认已推送。不能用 (table,row) 删除：
 * 网络请求期间该行可能又被用户改了，新入队的 seq 必须保留。
 */
export async function ack(seqs: number[]): Promise<void> {
  if (seqs.length === 0) return;
  const db = await getDatabase();
  const placeholders = seqs.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM sync_outbox WHERE seq IN (${placeholders})`, ...seqs);
}

/** 丢弃某行的待推送项（如收到该行的墓碑时）。 */
export async function dropRow(table: OutboxTable, rowId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM sync_outbox WHERE table_name = ? AND row_id = ?', table, rowId);
}

/** 清空队列（「以云端为准」时使用）。 */
export async function clearOutbox(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM sync_outbox');
}

/** 某行是否还有未推送的本地改动。 */
export async function isDirty(table: OutboxTable, rowId: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ seq: number }>(
    'SELECT seq FROM sync_outbox WHERE table_name = ? AND row_id = ? LIMIT 1',
    table,
    rowId,
  );
  return Boolean(row);
}
