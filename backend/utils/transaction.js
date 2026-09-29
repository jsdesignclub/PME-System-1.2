/**
 * Transaction helper.
 *
 * D20 — an audit row and the change it describes must commit together. That
 * guarantee has one shape in this codebase, and it is this function: take a
 * connection, run the work, and hand the same connection to every model call
 * so the mutation and its audit row land in the same COMMIT.
 *
 * The alternative — writing the mutation, then writing the audit row — has two
 * failure modes and both are bad:
 *
 *   - the audit insert fails  -> an invisible, unattributable change. The one
 *     outcome an audit trail exists to prevent.
 *   - the audit insert is fire-and-forget -> lost rows whenever the process
 *     dies between the two statements.
 *
 * A best-effort catch is worse than either, because it produces a log line
 * that says the change was audited when it was not.
 *
 * Usage:
 *   await withTransaction(async (tx) => {
 *     const updated = await userModel.update(id, patch, tx);
 *     await auditModel.insert({ ...entry, delta }, tx);
 *     return updated;
 *   });
 *
 * Note the `executor` parameter threaded through the model calls (D19). That
 * is what makes this work; a model that always reached for the pool would
 * quietly run its statements outside the transaction.
 */
import { pool } from '../config/db.js';

/**
 * Run `work` inside a transaction, committing on success and rolling back on
 * any throw.
 *
 * @template T
 * @param {(tx: import('mysql2/promise').PoolConnection) => Promise<T>} work
 * @returns {Promise<T>} whatever `work` returned
 */
export async function withTransaction(work) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // A rollback that itself fails means the connection is already gone.
      // The original error is the one worth reporting; losing the connection
      // to the pool below is the pool's problem to notice.
    }
    throw error;
  } finally {
    connection.release();
  }
}
