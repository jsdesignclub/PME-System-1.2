import { Router } from 'express';

import * as userController from '../controllers/userController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';

const router = Router();

// Every route in this file is administrator-only. The guard is declared once
// on the router rather than repeated per route, so adding a route without it
// is impossible rather than merely easy to forget.
router.use(authenticate, requireAdmin);

router.get('/', userController.list);
router.post('/', userController.create);
router.get('/:id', userController.getById);
router.patch('/:id', userController.update);
// Deactivates rather than deletes the row — see D23 in models/userModel.js.
router.delete('/:id', userController.deactivate);

export default router;
