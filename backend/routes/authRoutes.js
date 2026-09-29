import { Router } from 'express';

import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

/**
 * The complete unauthenticated surface of the whole application is the two
 * POSTs below. Everything else in this project passes through authenticate().
 *
 *   POST /auth/login     the only way to obtain a token
 *   POST /auth/refresh   takes a refresh token, mints a new pair
 *
 * Neither takes a Bearer token, because both are how you get one.
 */
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);

// From here the caller must present a valid access token.
router.get('/me', authenticate, authController.me);
router.get('/permissions', authenticate, authController.permissions);
router.post('/logout', authenticate, authController.logout);

export default router;
