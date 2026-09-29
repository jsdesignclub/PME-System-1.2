import { Router } from 'express';

import * as departmentController from '../controllers/departmentController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';

const router = Router();

// Reading the directory is open to every signed-in user — the department
// picker needs it, and the payload is a name and a code (Q14). Writing is
// admin-only.
router.get('/', authenticate, departmentController.list);
router.get('/:id', authenticate, departmentController.getById);

router.post('/', authenticate, requireAdmin, departmentController.create);
router.patch('/:id', authenticate, requireAdmin, departmentController.update);

export default router;
