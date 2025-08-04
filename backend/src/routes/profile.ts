/**
 * Profile Routes
 * Handles user profile management endpoints
 */

import { Router } from 'express';
import { profileController } from '../controllers/profile';
import { requireAuth, optionalAuth } from '../middleware/auth';

const router = Router();

// POST /api/profiles - Create new profile (protected route)
router.post('/', requireAuth, profileController.create);

// GET /api/profiles/me - Get current user's profile (protected route)
router.get('/me', requireAuth, profileController.getMe);

// PUT /api/profiles/me - Update current user's profile (protected route)
router.put('/me', requireAuth, profileController.updateMe);

// GET /api/profiles/:id - Get profile by ID (public route with privacy controls)
router.get('/:id', optionalAuth, profileController.getById);

export default router;