/**
 * Video Routes
 * Handles video upload and management endpoints
 */

import { Router } from 'express';
import { videoController } from '../controllers/videos';
import { requireAuth } from '../middleware/auth';

const router = Router();

// POST /api/videos/upload - Video upload with progress tracking (protected)
router.post('/upload', requireAuth, videoController.upload);

// GET /api/videos/upload-status/:uploadId - Check upload status (protected)
router.get('/upload-status/:uploadId', requireAuth, videoController.getUploadStatus);

// POST /api/videos/resume-upload - Resume interrupted upload (protected)
router.post('/resume-upload', requireAuth, videoController.resumeUpload);

// GET /api/videos - List all public videos (public)
router.get('/', videoController.listVideos);

// GET /api/videos/my-videos - Get current user's videos with all statuses (protected)
router.get('/my-videos', requireAuth, videoController.getMyVideos);

// GET /api/videos/user/:userId - Get user's public videos (public)
router.get('/user/:userId', videoController.getUserVideos);

// GET /api/videos/:id - Get single video details (public)
router.get('/:id', videoController.getVideo);

// PUT /api/videos/:id - Update video metadata (protected)
router.put('/:id', requireAuth, videoController.updateVideo);

// DELETE /api/videos/:id - Delete video (protected)
router.delete('/:id', requireAuth, videoController.deleteVideo);

// POST /api/videos/:id/like - Like/Unlike video (protected)
router.post('/:id/like', requireAuth, videoController.toggleVideoLike);

export default router;