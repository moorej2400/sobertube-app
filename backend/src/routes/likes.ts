/**
 * Likes Routes
 * API routes for like/unlike functionality
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { generalRateLimit } from '../middleware/rateLimiting';
import { likesController } from '../controllers/likes';

const router = Router();

/**
 * POST /api/likes
 * Toggle like/unlike for content (video or post)
 * Requires authentication
 * 
 * Body:
 * {
 *   "content_type": "video" | "post",
 *   "content_id": "uuid"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "liked": boolean,
 *   "likes_count": number,
 *   "content_type": "video" | "post",
 *   "content_id": "uuid"
 * }
 */
router.post('/', 
  generalRateLimit, 
  authenticateToken, 
  likesController.toggleLike
);

/**
 * GET /api/likes/status
 * Get like status for specific content
 * Requires authentication
 * 
 * Query Parameters:
 * - content_type: "video" | "post"
 * - content_id: "uuid"
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "content_type": "video" | "post",
 *     "content_id": "uuid",
 *     "liked": boolean,
 *     "likes_count": number
 *   }
 * }
 */
router.get('/status', 
  generalRateLimit, 
  authenticateToken, 
  likesController.getLikeStatus
);

/**
 * GET /api/likes/user
 * Get user's liked content history
 * Requires authentication
 * 
 * Query Parameters:
 * - content_type: "video" | "post" (optional - filter by content type)
 * - limit: number (optional, default 20, max 50)
 * - offset: number (optional, default 0)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "uuid",
 *       "content_type": "video" | "post",
 *       "content_id": "uuid",
 *       "liked_at": "ISO timestamp",
 *       "content_title": "string",
 *       "content_body": "string",
 *       "content_author_username": "string",
 *       "content_created_at": "ISO timestamp"
 *     }
 *   ],
 *   "pagination": {
 *     "limit": number,
 *     "offset": number,
 *     "has_more": boolean
 *   }
 * }
 */
router.get('/user', 
  generalRateLimit, 
  authenticateToken, 
  likesController.getUserLikedContent
);

export { router as likesRoutes };