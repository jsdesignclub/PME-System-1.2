import { Router } from 'express';

import { pool } from '../config/db.js';

const router = Router();

/**
 * The Phase 0 proof of life. It answers one question — can this process reach
 * MySQL? — which is the only thing Phase 0 needs to demonstrate.
 *
 * Returns 503 rather than crashing when the database is unreachable: an
 * unreachable database is a degraded service, not a dead one, and a monitor
 * polling this endpoint needs to distinguish the two.
 */
router.get('/health', async (req, res) => {
  const timestamp = new Date().toISOString();

  try {
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'ok',
      db: 'connected',
      timestamp,
    });
  } catch (error) {
    console.error('[health] database check failed', error.code || error.message);
    res.status(503).json({
      status: 'degraded',
      db: 'unreachable',
      timestamp,
    });
  }
});

export default router;
