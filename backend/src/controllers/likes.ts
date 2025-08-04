/**
 * Likes Controller
 * Handles like/unlike operations for videos and posts
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../services/supabase';
import { logger } from '../utils/logger';
import { asyncErrorHandler } from '../middleware/errorHandler';

/**
 * Like request body interface
 */
export interface LikeRequest {
  content_type: 'video' | 'post';
  content_id: string;
}

/**
 * Like status response interface
 */
export interface LikeStatusResponse {
  content_type: 'video' | 'post';
  content_id: string;
  liked: boolean;
  likes_count: number;
}

/**
 * Toggle like response interface
 */
export interface ToggleLikeResponse {
  success: boolean;
  liked: boolean;
  likes_count: number;
  content_type: 'video' | 'post';
  content_id: string;
}

export const likesController = {
  /**
   * Toggle Like Handler (POST /api/likes)
   * Like or unlike content based on current status
   */
  toggleLike: asyncErrorHandler(async (req: Request, res: Response) => {
    // Check authentication
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required'
      });
      return;
    }

    const { content_type, content_id }: LikeRequest = req.body;

    // Validate request body
    if (!content_type || !content_id) {
      res.status(400).json({
        success: false,
        error: 'content_type and content_id are required'
      });
      return;
    }

    // Validate content_type
    if (!['video', 'post'].includes(content_type)) {
      res.status(400).json({
        success: false,
        error: 'content_type must be either "video" or "post"'
      });
      return;
    }

    // Validate content_id format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(content_id)) {
      res.status(400).json({
        success: false,
        error: 'content_id must be a valid UUID'
      });
      return;
    }

    const supabaseClient = getSupabaseClient();
    const userId = req.user.id;

    try {
      // Use the toggle_like database function for atomic operation
      const { data, error } = await supabaseClient
        .rpc('toggle_like', {
          p_user_id: userId,
          p_content_type: content_type,
          p_content_id: content_id
        });

      if (error) {
        // Handle specific database errors
        if (error.message.includes('Invalid video_id') || error.message.includes('Invalid post_id')) {
          res.status(404).json({
            success: false,
            error: `${content_type} not found`
          });
          return;
        }

        logger.error('Database error in toggle_like', {
          error: error.message,
          userId,
          contentType: content_type,
          contentId: content_id,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to toggle like'
        });
        return;
      }

      if (!data || data.length === 0) {
        res.status(500).json({
          success: false,
          error: 'failed to toggle like'
        });
        return;
      }

      const result = data[0];
      const response: ToggleLikeResponse = {
        success: true,
        liked: result.liked,
        likes_count: result.total_likes,
        content_type,
        content_id
      };

      logger.info('Like toggled successfully', {
        userId,
        contentType: content_type,
        contentId: content_id,
        liked: result.liked,
        totalLikes: result.total_likes,
        requestId: req.requestId
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error('Toggle like error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        contentType: content_type,
        contentId: content_id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to toggle like'
      });
    }
  }),

  /**
   * Get Like Status Handler (GET /api/likes/status)
   * Check if user has liked specific content
   */
  getLikeStatus: asyncErrorHandler(async (req: Request, res: Response) => {
    // Check authentication
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required'
      });
      return;
    }

    const { content_type, content_id } = req.query;

    // Validate query parameters
    if (!content_type || !content_id) {
      res.status(400).json({
        success: false,
        error: 'content_type and content_id query parameters are required'
      });
      return;
    }

    // Validate content_type
    if (!['video', 'post'].includes(content_type as string)) {
      res.status(400).json({
        success: false,
        error: 'content_type must be either "video" or "post"'
      });
      return;
    }

    // Validate content_id format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(content_id as string)) {
      res.status(400).json({
        success: false,
        error: 'content_id must be a valid UUID'
      });
      return;
    }

    const supabaseClient = getSupabaseClient();
    const userId = req.user.id;

    try {
      // Check if user has liked this content
      const { data: likeData, error: likeError } = await supabaseClient
        .from('likes')
        .select('id')
        .eq('user_id', userId)
        .eq('content_type', content_type)
        .eq('content_id', content_id)
        .single();

      if (likeError && likeError.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.error('Database error checking like status', {
          error: likeError.message,
          userId,
          contentType: content_type,
          contentId: content_id,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to check like status'
        });
        return;
      }

      const liked = !!likeData;

      // Get total likes count for this content
      const { count, error: countError } = await supabaseClient
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('content_type', content_type)
        .eq('content_id', content_id);

      if (countError) {
        logger.error('Database error getting likes count', {
          error: countError.message,
          contentType: content_type,
          contentId: content_id,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to get likes count'
        });
        return;
      }

      const response: LikeStatusResponse = {
        content_type: content_type as 'video' | 'post',
        content_id: content_id as string,
        liked,
        likes_count: count || 0
      };

      logger.info('Like status retrieved successfully', {
        userId,
        contentType: content_type,
        contentId: content_id,
        liked,
        likesCount: count || 0,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error('Get like status error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        contentType: content_type,
        contentId: content_id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to check like status'
      });
    }
  }),

  /**
   * Get User's Liked Content Handler (GET /api/likes/user)
   * Get list of content that user has liked
   */
  getUserLikedContent: asyncErrorHandler(async (req: Request, res: Response) => {
    // Check authentication
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required'
      });
      return;
    }

    const {
      content_type,
      limit: limitParam = '20',
      offset: offsetParam = '0'
    } = req.query;

    // Parse and validate parameters
    const limit = Math.min(50, Math.max(1, parseInt(limitParam as string, 10) || 20));
    const offset = Math.max(0, parseInt(offsetParam as string, 10) || 0);

    if (isNaN(limit) || isNaN(offset)) {
      res.status(400).json({
        success: false,
        error: 'limit and offset must be valid integers'
      });
      return;
    }

    // Validate content_type if provided
    if (content_type && !['video', 'post'].includes(content_type as string)) {
      res.status(400).json({
        success: false,
        error: 'content_type must be either "video" or "post"'
      });
      return;
    }

    const supabaseClient = getSupabaseClient();
    const userId = req.user.id;

    try {
      // Use the get_user_liked_content database function
      const { data, error } = await supabaseClient
        .rpc('get_user_liked_content', {
          p_user_id: userId,
          p_content_type: content_type || null,
          p_limit: limit,
          p_offset: offset
        });

      if (error) {
        logger.error('Database error getting user liked content', {
          error: error.message,
          userId,
          contentType: content_type || 'all',
          limit,
          offset,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to get liked content'
        });
        return;
      }

      logger.info('User liked content retrieved successfully', {
        userId,
        contentType: content_type || 'all',
        count: data?.length || 0,
        limit,
        offset,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        data: data || [],
        pagination: {
          limit,
          offset,
          has_more: (data?.length || 0) === limit
        }
      });

    } catch (error) {
      logger.error('Get user liked content error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        contentType: content_type || 'all',
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to get liked content'
      });
    }
  })
};