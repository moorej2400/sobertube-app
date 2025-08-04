/**
 * Feed Routes
 * Handles unified feed endpoints combining videos and posts
 */

import { Router } from 'express';
import { feedController } from '../controllers/feed';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /api/feed - Get unified feed (videos + posts) (public)
router.get('/', feedController.getFeed);

// GET /api/feed/personalized - Get personalized feed for authenticated user (protected)
router.get('/personalized', requireAuth, feedController.getPersonalizedFeed);

// GET /api/feed/stats - Get feed statistics (public)
router.get('/stats', feedController.getFeedStats);

export default router;