import { Router } from 'express';

import * as auditController from '../controllers/auditController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';

const router = Router();

// Read-only, and admin-only. There is no write route here on purpose: audit
// rows are written by the controllers that make changes, inside the same
// transaction as the change itself (D20), never by a client.
router.use(authenticate, requireAdmin);

router.get('/', auditController.list);
router.get('/:id', auditController.getById);

export default router;
