/**
 * Follows Routes
 * API routes for follow/unfollow functionality
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { generalRateLimit } from '../middleware/rateLimiting';
import { followsController } from '../controllers/follows';

const router = Router();

/**
 * POST /api/follows
 * Toggle follow/unfollow for a user
 * Requires authentication
 * 
 * Body:
 * {
 *   "following_id": "uuid"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "following": boolean,
 *   "follower_count": number,
 *   "following_count": number,
 *   "following_id": "uuid"
 * }
 */
router.post('/', 
  generalRateLimit, 
  authenticateToken, 
  followsController.toggleFollow
);

/**
 * GET /api/follows/status
 * Get follow status for specific user
 * Requires authentication
 * 
 * Query Parameters:
 * - user_id: "uuid" (required)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "user_id": "uuid",
 *     "following": boolean,
 *     "is_mutual": boolean,
 *     "follower_count": number,
 *     "following_count": number
 *   }
 * }
 */
router.get('/status', 
  generalRateLimit, 
  authenticateToken, 
  followsController.getFollowStatus
);

/**
 * GET /api/follows/following
 * Get list of users that current user follows
 * Requires authentication
 * 
 * Query Parameters:
 * - limit: number (optional, default 20, max 50)
 * - offset: number (optional, default 0)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "following_id": "uuid",
 *       "username": "string",
 *       "display_name": "string",
 *       "profile_picture_url": "string",
 *       "bio": "string",
 *       "followed_at": "ISO timestamp",
 *       "is_mutual": boolean
 *     }
 *   ],
 *   "pagination": {
 *     "limit": number,
 *     "offset": number,
 *     "has_more": boolean
 *   }
 * }
 */
router.get('/following', 
  generalRateLimit, 
  authenticateToken, 
  followsController.getUserFollowing
);

/**
 * GET /api/follows/followers
 * Get list of users following current user
 * Requires authentication
 * 
 * Query Parameters:
 * - limit: number (optional, default 20, max 50)
 * - offset: number (optional, default 0)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "follower_id": "uuid",
 *       "username": "string",
 *       "display_name": "string",
 *       "profile_picture_url": "string",
 *       "bio": "string",
 *       "followed_at": "ISO timestamp",
 *       "is_mutual": boolean
 *     }
 *   ],
 *   "pagination": {
 *     "limit": number,
 *     "offset": number,
 *     "has_more": boolean
 *   }
 * }
 */
router.get('/followers', 
  generalRateLimit, 
  authenticateToken, 
  followsController.getUserFollowers
);

export { router as followsRoutes };