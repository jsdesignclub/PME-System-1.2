import { Router } from 'express';

import { pool } from '../config/db.js';
import { authenticate } from '../middleware/authMiddleware.js';
import auditRoutes from './auditRoutes.js';
import authRoutes from './authRoutes.js';
import departmentRoutes from './departmentRoutes.js';
import userRoutes from './userRoutes.js';

const router = Router();

/**
 * The Phase 0 proof of life. It answers one question — can this process reach
 * MySQL? — which is the only thing it needs to demonstrate.
 *
 * Returns 503 rather than crashing when the database is unreachable: an
 * unreachable database is a degraded service, not a dead one, and a monitor
 * polling this endpoint needs to distinguish the two.
 *
 * It is deliberately NOT behind authenticate: a health check that requires a
 * token cannot report that the token service is down.
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

/**
 * Route registry. Each module router applies its own guards, so what appears
 * here is only the mount point.
 *
 * The unauthenticated surface of the entire API is /health, POST /auth/login
 * and POST /auth/refresh. Everything else declares `authenticate` itself.
 */
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/departments', departmentRoutes);
router.use('/audit', auditRoutes);

export default router;
