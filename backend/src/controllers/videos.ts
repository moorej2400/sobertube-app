/**
 * Videos Controller
 * Handles video upload operations and file management
 */

import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '../services/supabase';
import { VideoFileValidator } from '../services/videoFileValidator';
import { videoStorageService } from '../services/videoStorage';
import { logger } from '../utils/logger';
import { asyncErrorHandler } from '../middleware/errorHandler';

// Upload status tracking
interface UploadSession {
  id: string;
  userId: string;
  filename: string;
  totalSize: number;
  uploadedSize: number;
  status: 'uploading' | 'processing' | 'complete' | 'failed' | 'cancelled';
  filePath?: string;
  videoId?: string;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
}

// In-memory upload sessions store (in production, use Redis or database)
const uploadSessions = new Map<string, UploadSession>();

// Configure multer for temporary file storage
const uploadDir = process.env['UPLOAD_TEMP_DIR'] || '/tmp/sobertube-uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uploadId = uuidv4();
    const extension = path.extname(file.originalname);
    const filename = `${uploadId}${extension}`;
    
    // Store upload ID in request for tracking
    req.uploadId = uploadId;
    
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    // Quick format validation
    const videoFileValidator = new VideoFileValidator();
    const isValidFormat = videoFileValidator.quickFormatCheck(file.originalname, file.mimetype);
    
    if (isValidFormat) {
      cb(null, true);
    } else {
      cb(new Error('Invalid video format. Only MP4, MOV, and AVI files are supported.'));
    }
  }
});

export const videoController = {
  /**
   * Video Upload Handler with Progress Tracking
   * POST /api/videos/upload
   */
  upload: [
    upload.single('video'),
    asyncErrorHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      
      try {
        // Check if file was uploaded
        if (!req.file) {
          res.status(400).json({
            success: false,
            error: 'No video file provided'
          });
          return;
        }

        // Get authenticated user
        if (!req.user) {
          res.status(401).json({
            success: false,
            error: 'Authentication required'
          });
          return;
        }

        const { title, description } = req.body;
        const uploadId = req.uploadId || uuidv4();
        const userId = req.user.id;

        logger.info('Video upload started', {
          uploadId,
          userId,
          filename: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
          requestId: req.requestId
        });

        // Create upload session
        const uploadSession: UploadSession = {
          id: uploadId,
          userId,
          filename: req.file.originalname,
          totalSize: req.file.size,
          uploadedSize: req.file.size, // File is fully uploaded at this point
          status: 'processing',
          filePath: req.file.path,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        uploadSessions.set(uploadId, uploadSession);

        // Validate the uploaded video file
        const videoFileValidator = new VideoFileValidator();
        const validationResult = await videoFileValidator.validateVideoFile({
          filename: req.file.originalname,
          mimetype: req.file.mimetype,
          path: req.file.path
        });

        if (!validationResult.isValid) {
          // Update session status
          uploadSession.status = 'failed';
          uploadSession.error = validationResult.errors.join(', ');
          uploadSession.updatedAt = new Date();
          uploadSessions.set(uploadId, uploadSession);

          // Clean up temporary file
          try {
            await fs.promises.unlink(req.file.path);
          } catch (cleanupError) {
            logger.warn('Failed to clean up invalid video file', {
              filePath: req.file.path,
              error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error'
            });
          }

          logger.warn('Video validation failed', {
            uploadId,
            userId,
            filename: req.file.originalname,
            errors: validationResult.errors,
            requestId: req.requestId
          });

          res.status(400).json({
            success: false,
            upload_id: uploadId,
            errors: validationResult.errors,
            status: 'failed'
          });
          return;
        }

        // Create video record in database
        const videoId = uuidv4();
        const supabaseClient = getSupabaseClient();

        // Generate storage path
        const fileExtension = path.extname(req.file.originalname).substring(1);
        const storagePath = videoStorageService.generateVideoPath(userId, videoId, fileExtension);

        // For now, we'll create the database record and return success
        // In the next phase, we'll implement actual file upload to Supabase storage
        const { data: video, error: dbError } = await supabaseClient
          .from('videos')
          .insert({
            id: videoId,
            user_id: userId,
            title: title || path.parse(req.file.originalname).name,
            description: description || null,
            video_url: `/${storagePath}`, // Placeholder URL
            duration: validationResult.fileInfo?.durationSeconds || 0,
            file_size: req.file.size,
            format: fileExtension.toLowerCase(),
            status: 'processing'
          })
          .select()
          .single();

        if (dbError) {
          // Update session status
          uploadSession.status = 'failed';
          uploadSession.error = 'Database error: ' + dbError.message;
          uploadSession.updatedAt = new Date();
          uploadSessions.set(uploadId, uploadSession);

          // Clean up temporary file
          try {
            await fs.promises.unlink(req.file.path);
          } catch (cleanupError) {
            logger.warn('Failed to clean up file after database error', {
              filePath: req.file.path,
              error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error'
            });
          }

          logger.error('Failed to create video record', {
            uploadId,
            userId,
            error: dbError.message,
            requestId: req.requestId
          });

          res.status(500).json({
            success: false,
            upload_id: uploadId,
            error: 'Failed to create video record',
            status: 'failed'
          });
          return;
        }

        // Update session with success
        uploadSession.status = 'complete';
        uploadSession.videoId = videoId;
        uploadSession.updatedAt = new Date();
        uploadSessions.set(uploadId, uploadSession);

        const processingTime = Date.now() - startTime;

        logger.info('Video upload completed successfully', {
          uploadId,
          videoId,
          userId,
          filename: req.file.originalname,
          processingTime,
          requestId: req.requestId
        });

        // Clean up temporary file (in production, this would be moved to storage)
        try {
          await fs.promises.unlink(req.file.path);
        } catch (cleanupError) {
          logger.warn('Failed to clean up temporary file', {
            filePath: req.file.path,
            error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error'
          });
        }

        res.status(201).json({
          success: true,
          message: 'Video uploaded successfully',
          upload_id: uploadId,
          video_id: videoId,
          progress: 100,
          status: 'complete',
          video: video,
          processing_time_ms: processingTime
        });

      } catch (error) {
        const processingTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        logger.error('Video upload error', {
          error: errorMessage,
          uploadId: req.uploadId,
          userId: req.user?.id,
          processingTime,
          requestId: req.requestId
        });

        // Clean up temporary file if it exists
        if (req.file?.path) {
          try {
            await fs.promises.unlink(req.file.path);
          } catch (cleanupError) {
            logger.warn('Failed to clean up file after error', {
              filePath: req.file.path,
              error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error'
            });
          }
        }

        // Update session if exists
        if (req.uploadId && uploadSessions.has(req.uploadId)) {
          const session = uploadSessions.get(req.uploadId)!;
          session.status = 'failed';
          session.error = errorMessage;
          session.updatedAt = new Date();
          uploadSessions.set(req.uploadId, session);
        }

        res.status(500).json({
          success: false,
          upload_id: req.uploadId,
          error: 'Video upload failed',
          status: 'failed'
        });
      }
    })
  ],

  /**
   * Get Upload Status Handler
   * GET /api/videos/upload-status/:uploadId
   */
  getUploadStatus: asyncErrorHandler(async (req: Request, res: Response) => {
    const { uploadId } = req.params;

    // Validate uploadId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uploadId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid upload ID format'
      });
      return;
    }

    // Get authenticated user
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const session = uploadSessions.get(uploadId);

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Upload session not found'
      });
      return;
    }

    // Check if user owns this upload session
    if (session.userId !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'Access denied'
      });
      return;
    }

    // Calculate progress percentage
    const progress = session.totalSize > 0 
      ? Math.round((session.uploadedSize / session.totalSize) * 100)
      : 0;

    logger.debug('Upload status requested', {
      uploadId,
      userId: req.user.id,
      status: session.status,
      progress,
      requestId: req.requestId
    });

    res.status(200).json({
      success: true,
      upload_id: uploadId,
      status: session.status,
      progress,
      filename: session.filename,
      total_size: session.totalSize,
      uploaded_size: session.uploadedSize,
      video_id: session.videoId,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      error: session.error
    });
  }),

  /**
   * Resume Upload Handler (placeholder for future implementation)
   * POST /api/videos/resume-upload
   */
  resumeUpload: asyncErrorHandler(async (req: Request, res: Response) => {
    const { uploadId, chunkIndex } = req.body;

    // Input validation
    if (!uploadId || typeof chunkIndex !== 'number') {
      res.status(400).json({
        success: false,
        error: 'uploadId and chunkIndex are required'
      });
      return;
    }

    // Get authenticated user
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    logger.info('Resume upload requested (not yet implemented)', {
      uploadId,
      chunkIndex,
      userId: req.user.id,
      requestId: req.requestId
    });

    // For now, return not implemented
    res.status(501).json({
      success: false,
      error: 'Resumable uploads not yet implemented',
      upload_id: uploadId,
      status: 'not_implemented'
    });
  }),

  /**
   * List All Public Videos
   * GET /api/videos
   */
  listVideos: asyncErrorHandler(async (req: Request, res: Response) => {
    const supabaseClient = getSupabaseClient();
    
    // Parse query parameters
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query['limit'] as string) || 10));
    const offset = (page - 1) * limit;
    
    // Sorting parameters
    const sortBy = req.query['sort'] as string || 'created_at';
    const sortOrder = (req.query['order'] as string)?.toLowerCase() === 'asc' ? 'asc' : 'desc';
    const validSortFields = ['created_at', 'views_count', 'likes_count', 'title', 'duration'];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    
    // Filtering parameters
    const minDuration = parseInt(req.query['min_duration'] as string) || undefined;
    const maxDuration = parseInt(req.query['max_duration'] as string) || undefined;
    const format = req.query['format'] as string;

    try {
      // Build query
      let query = supabaseClient
        .from('videos')
        .select(`
          id,
          title,
          description,
          video_url,
          thumbnail_url,
          duration,
          file_size,
          format,
          views_count,
          likes_count,
          comments_count,
          created_at,
          updated_at
        `, { count: 'exact' })
        .eq('status', 'ready');

      // Apply filters
      if (minDuration !== undefined) {
        query = query.gte('duration', minDuration);
      }
      if (maxDuration !== undefined) {
        query = query.lte('duration', maxDuration);
      }
      if (format && ['mp4', 'mov', 'avi'].includes(format.toLowerCase())) {
        query = query.eq('format', format.toLowerCase());
      }

      // Apply sorting and pagination
      query = query
        .order(actualSortBy, { ascending: sortOrder === 'asc' })
        .range(offset, offset + limit - 1);

      const { data: videos, error, count } = await query;

      if (error) {
        logger.error('Failed to fetch videos', {
          error: error.message,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'Failed to fetch videos'
        });
        return;
      }

      const totalPages = count ? Math.ceil(count / limit) : 1;

      logger.info('Videos listed successfully', {
        count: videos?.length || 0,
        page,
        limit,
        total: count,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        data: videos || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Error listing videos', {
        error: errorMessage,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch videos'
      });
    }
  }),

  /**
   * Get Single Video
   * GET /api/videos/:id
   */
  getVideo: asyncErrorHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const supabaseClient = getSupabaseClient();

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid video ID format'
      });
      return;
    }

    try {
      // Get video (only ready videos for public access)
      const { data: video, error } = await supabaseClient
        .from('videos')
        .select(`
          id,
          title,
          description,
          video_url,
          thumbnail_url,
          duration,
          file_size,
          format,
          views_count,
          likes_count,
          comments_count,
          status,
          created_at,
          updated_at
        `)
        .eq('id', id)
        .eq('status', 'ready')
        .single();

      if (error || !video) {
        logger.warn('Video not found or not ready', {
          videoId: id,
          error: error?.message,
          requestId: req.requestId
        });

        res.status(404).json({
          success: false,
          error: 'Video not found'
        });
        return;
      }

      // Increment view count
      const { error: updateError } = await supabaseClient
        .from('videos')
        .update({ views_count: video.views_count + 1 })
        .eq('id', id);

      if (updateError) {
        logger.warn('Failed to increment view count', {
          videoId: id,
          error: updateError.message,
          requestId: req.requestId
        });
      }

      logger.info('Video retrieved successfully', {
        videoId: id,
        title: video.title,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        data: {
          ...video,
          views_count: video.views_count + 1 // Return updated count
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Error retrieving video', {
        videoId: id,
        error: errorMessage,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve video'
      });
    }
  }),

  /**
   * Get User's Public Videos
   * GET /api/videos/user/:userId
   */
  getUserVideos: asyncErrorHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const supabaseClient = getSupabaseClient();

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
      return;
    }

    // Parse pagination parameters
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query['limit'] as string) || 10));
    const offset = (page - 1) * limit;

    try {
      // Check if user exists
      const { data: user, error: userError } = await supabaseClient
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Get user's ready videos
      const { data: videos, error, count } = await supabaseClient
        .from('videos')
        .select(`
          id,
          title,
          description,
          video_url,
          thumbnail_url,
          duration,
          file_size,
          format,
          views_count,
          likes_count,
          comments_count,
          created_at,
          updated_at
        `, { count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'ready')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error('Failed to fetch user videos', {
          userId,
          error: error.message,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'Failed to fetch user videos'
        });
        return;
      }

      const totalPages = count ? Math.ceil(count / limit) : 1;

      logger.info('User videos retrieved successfully', {
        userId,
        count: videos?.length || 0,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        data: videos || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Error fetching user videos', {
        userId,
        error: errorMessage,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch user videos'
      });
    }
  }),

  /**
   * Get Current User's Videos (All Statuses)
   * GET /api/videos/my-videos
   */
  getMyVideos: asyncErrorHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const supabaseClient = getSupabaseClient();
    const userId = req.user.id;

    // Parse query parameters
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query['limit'] as string) || 10));
    const offset = (page - 1) * limit;
    const status = req.query['status'] as string;

    try {
      // Build query
      let query = supabaseClient
        .from('videos')
        .select(`
          id,
          title,
          description,
          video_url,
          thumbnail_url,
          duration,
          file_size,
          format,
          views_count,
          likes_count,
          comments_count,
          status,
          created_at,
          updated_at
        `, { count: 'exact' })
        .eq('user_id', userId);

      // Filter by status if provided
      if (status && ['ready', 'processing', 'failed'].includes(status)) {
        query = query.eq('status', status);
      }

      // Apply pagination and sorting
      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data: videos, error, count } = await query;

      if (error) {
        logger.error('Failed to fetch user\'s videos', {
          userId,
          error: error.message,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'Failed to fetch videos'
        });
        return;
      }

      const totalPages = count ? Math.ceil(count / limit) : 1;

      logger.info('User\'s videos retrieved successfully', {
        userId,
        count: videos?.length || 0,
        status,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        data: videos || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Error fetching user\'s videos', {
        userId,
        error: errorMessage,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch videos'
      });
    }
  }),

  /**
   * Update Video Metadata
   * PUT /api/videos/:id
   */
  updateVideo: asyncErrorHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const { id } = req.params;
    const { title, description } = req.body;
    const supabaseClient = getSupabaseClient();
    const userId = req.user.id;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid video ID format'
      });
      return;
    }

    // Validate input
    if (title && (typeof title !== 'string' || title.trim().length === 0 || title.length > 200)) {
      res.status(400).json({
        success: false,
        error: 'Title must be a non-empty string with maximum 200 characters'
      });
      return;
    }

    if (description && (typeof description !== 'string' || description.length > 2000)) {
      res.status(400).json({
        success: false,
        error: 'Description must be a string with maximum 2000 characters'
      });
      return;
    }

    try {
      // Check if video exists and user owns it
      const { data: existingVideo, error: fetchError } = await supabaseClient
        .from('videos')
        .select('id, user_id, title, description')
        .eq('id', id)
        .single();

      if (fetchError || !existingVideo) {
        res.status(404).json({
          success: false,
          error: 'Video not found'
        });
        return;
      }

      if (existingVideo.user_id !== userId) {
        res.status(403).json({
          success: false,
          error: 'Access denied'
        });
        return;
      }

      // Prepare update data
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (title !== undefined) {
        updateData.title = title.trim();
      }
      if (description !== undefined) {
        updateData.description = description.trim() || null;
      }

      // Update video
      const { data: updatedVideo, error: updateError } = await supabaseClient
        .from('videos')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        logger.error('Failed to update video', {
          videoId: id,
          userId,
          error: updateError.message,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'Failed to update video'
        });
        return;
      }

      logger.info('Video updated successfully', {
        videoId: id,
        userId,
        changes: { title, description },
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        message: 'Video updated successfully',
        data: updatedVideo
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Error updating video', {
        videoId: id,
        userId,
        error: errorMessage,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update video'
      });
    }
  }),

  /**
   * Delete Video
   * DELETE /api/videos/:id
   */
  deleteVideo: asyncErrorHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const { id } = req.params;
    const supabaseClient = getSupabaseClient();
    const userId = req.user.id;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid video ID format'
      });
      return;
    }

    try {
      // Check if video exists and user owns it
      const { data: existingVideo, error: fetchError } = await supabaseClient
        .from('videos')
        .select('id, user_id, video_url, title')
        .eq('id', id)
        .single();

      if (fetchError || !existingVideo) {
        res.status(404).json({
          success: false,
          error: 'Video not found'
        });
        return;
      }

      if (existingVideo.user_id !== userId) {
        res.status(403).json({
          success: false,
          error: 'Access denied'
        });
        return;
      }

      // Delete video from database
      const { error: deleteError } = await supabaseClient
        .from('videos')
        .delete()
        .eq('id', id);

      if (deleteError) {
        logger.error('Failed to delete video', {
          videoId: id,
          userId,
          error: deleteError.message,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'Failed to delete video'
        });
        return;
      }

      // TODO: In future, implement storage file deletion
      // await videoStorageService.deleteVideoFile(existingVideo.video_url);

      logger.info('Video deleted successfully', {
        videoId: id,
        userId,
        title: existingVideo.title,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        message: 'Video deleted successfully'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Error deleting video', {
        videoId: id,
        userId,
        error: errorMessage,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to delete video'
      });
    }
  }),

  /**
   * Like/Unlike Video
   * POST /api/videos/:id/like
   */
  toggleVideoLike: asyncErrorHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const { id } = req.params;
    const supabaseClient = getSupabaseClient();
    const userId = req.user.id;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid video ID format'
      });
      return;
    }

    try {
      // Check if video exists and is ready
      const { data: video, error: videoError } = await supabaseClient
        .from('videos')
        .select('id, likes_count, status')
        .eq('id', id)
        .eq('status', 'ready')
        .single();

      if (videoError || !video) {
        res.status(404).json({
          success: false,
          error: 'Video not found'
        });
        return;
      }

      // Check if user already liked this video (would need a video_likes table in production)
      // For now, we'll implement a simple toggle mechanism
      // In production, you'd create a video_likes table to track individual likes
      
      // For this implementation, we'll just increment/decrement the likes_count
      // This is a simplified approach - production would need proper like tracking
      const newLikesCount = video.likes_count + 1; // Simplified: always increment
      
      const { data: updatedVideo, error: updateError } = await supabaseClient
        .from('videos')
        .update({ likes_count: newLikesCount })
        .eq('id', id)
        .select('likes_count')
        .single();

      if (updateError) {
        logger.error('Failed to update video likes', {
          videoId: id,
          userId,
          error: updateError.message,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'Failed to update video likes'
        });
        return;
      }

      logger.info('Video like toggled successfully', {
        videoId: id,
        userId,
        newLikesCount,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        liked: true, // Simplified: always true for this implementation
        likes_count: updatedVideo.likes_count
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Error toggling video like', {
        videoId: id,
        userId,
        error: errorMessage,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to toggle video like'
      });
    }
  })
};

// Extend Express Request interface to include upload tracking
declare global {
  namespace Express {
    interface Request {
      uploadId?: string;
    }
  }
}