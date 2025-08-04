/**
 * Comments Routes
 * API routes for comment CRUD operations
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { limiter } from '../middleware/rateLimiter';
import { commentsController } from '../controllers/comments';

const router = Router();

/**
 * POST /api/comments
 * Create a new comment on video or post
 * Requires authentication
 * 
 * Body:
 * {
 *   "content_type": "video" | "post",
 *   "content_id": "uuid",
 *   "content": "string (1-2000 chars)",
 *   "parent_comment_id": "uuid" (optional - for replies)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid",
 *     "user_id": "uuid",
 *     "username": "string",
 *     "display_name": "string",
 *     "profile_picture_url": "string",
 *     "content": "string",
 *     "likes_count": number,
 *     "replies_count": number,
 *     "is_edited": boolean,
 *     "created_at": "ISO timestamp",
 *     "updated_at": "ISO timestamp",
 *     "parent_comment_id": "uuid" | null
 *   }
 * }
 */
router.post('/', 
  limiter, 
  authenticateToken, 
  commentsController.createComment
);

/**
 * GET /api/comments
 * Get comments for specific content with pagination and threading
 * No authentication required (public comments)
 * 
 * Query Parameters:
 * - content_type: "video" | "post" (required)
 * - content_id: "uuid" (required)
 * - parent_comment_id: "uuid" (optional - for getting replies to a specific comment)
 * - limit: number (optional, default 20, max 100)
 * - offset: number (optional, default 0)
 * - sort_order: "newest" | "oldest" | "most_liked" (optional, default "newest")
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "uuid",
 *       "user_id": "uuid",
 *       "username": "string",
 *       "display_name": "string",
 *       "profile_picture_url": "string",
 *       "content": "string",
 *       "likes_count": number,
 *       "replies_count": number,
 *       "is_edited": boolean,
 *       "created_at": "ISO timestamp",
 *       "updated_at": "ISO timestamp",
 *       "parent_comment_id": "uuid" | null
 *     }
 *   ],
 *   "pagination": {
 *     "limit": number,
 *     "offset": number,
 *     "has_more": boolean,
 *     "total_returned": number
 *   },
 *   "metadata": {
 *     "content_type": "video" | "post",
 *     "content_id": "uuid",
 *     "parent_comment_id": "uuid" | null,
 *     "sort_order": "newest" | "oldest" | "most_liked"
 *   }
 * }
 */
router.get('/', 
  limiter, 
  commentsController.getComments
);

/**
 * PUT /api/comments/:id
 * Update a comment (only by the comment author)
 * Requires authentication
 * 
 * URL Parameters:
 * - id: "uuid" (comment ID)
 * 
 * Body:
 * {
 *   "content": "string (1-2000 chars)"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid",
 *     "user_id": "uuid",
 *     "username": "string",
 *     "display_name": "string",
 *     "profile_picture_url": "string",
 *     "content": "string",
 *     "likes_count": number,
 *     "replies_count": number,
 *     "is_edited": true,
 *     "created_at": "ISO timestamp",
 *     "updated_at": "ISO timestamp",
 *     "parent_comment_id": "uuid" | null
 *   }
 * }
 */
router.put('/:id', 
  limiter, 
  authenticateToken, 
  commentsController.updateComment
);

/**
 * DELETE /api/comments/:id
 * Delete a comment (only by the comment author)
 * Requires authentication
 * Note: Deleting a parent comment will also delete all its replies (CASCADE)
 * 
 * URL Parameters:
 * - id: "uuid" (comment ID)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "comment deleted successfully",
 *   "data": {
 *     "id": "uuid",
 *     "deleted_at": "ISO timestamp"
 *   }
 * }
 */
router.delete('/:id', 
  limiter, 
  authenticateToken, 
  commentsController.deleteComment
);

export { router as commentsRoutes };