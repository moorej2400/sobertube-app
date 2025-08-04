/**
 * Posts Routes
 * Handles post CRUD endpoints for the recovery community
 */

import { Router } from 'express';
import { postsController } from '../controllers/posts';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /api/posts - Get paginated posts feed (public)
router.get('/', postsController.getPosts);

// GET /api/posts/:id - Get single post by ID (public)
router.get('/:id', postsController.getPost);

// POST /api/posts - Create new post (protected)
router.post('/', requireAuth, postsController.create);

// PUT /api/posts/:id - Update post by ID (protected, owner only)
router.put('/:id', requireAuth, postsController.update);

// DELETE /api/posts/:id - Delete post by ID (protected, owner only)
router.delete('/:id', requireAuth, postsController.delete);

export default router;