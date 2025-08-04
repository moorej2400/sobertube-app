/**
 * Authentication Routes
 * Handles user authentication endpoints including registration, login, logout
 */

import { Router } from 'express';
import { authController } from '../controllers/auth';
import { requireAuth } from '../middleware/auth';
import { registrationRateLimit, loginRateLimit } from '../middleware/rateLimiting';

const router = Router();

// POST /api/auth/register - User registration
router.post('/register', registrationRateLimit, authController.register);

// POST /api/auth/login - User login
router.post('/login', loginRateLimit, authController.login);

// POST /api/auth/logout - User logout
router.post('/logout', authController.logout);

// GET /api/auth/profile - Get user profile (protected route)
router.get('/profile', requireAuth, authController.profile);

// POST /api/auth/refresh - Refresh access token using refresh token
router.post('/refresh', authController.refresh);

export default router;