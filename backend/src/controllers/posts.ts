/**
 * Posts Controller
 * Handles post CRUD operations and business logic
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../services/supabase';
import { logger } from '../utils/logger';
import { asyncErrorHandler } from '../middleware/errorHandler';
import { Post, CreatePostRequest, UpdatePostRequest, PostType } from '../types/supabase';

export const postsController = {
  /**
   * Create Post Handler
   * POST /api/posts
   */
  create: asyncErrorHandler(async (req: Request, res: Response) => {
    const { content, post_type, image_url }: CreatePostRequest = req.body;

    // Input validation
    if (!content) {
      res.status(400).json({
        success: false,
        error: 'content is required'
      });
      return;
    }

    if (content.length > 500) {
      res.status(400).json({
        success: false,
        error: 'content must be 500 characters or less'
      });
      return;
    }

    if (content.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'content cannot be empty'
      });
      return;
    }

    // Validate post_type if provided
    const validPostTypes: PostType[] = ['Recovery Update', 'Milestone', 'Inspiration', 'Question', 'Gratitude'];
    const finalPostType = post_type || 'Recovery Update';
    
    if (!validPostTypes.includes(finalPostType)) {
      res.status(400).json({
        success: false,
        error: 'invalid post_type. Must be one of: Recovery Update, Milestone, Inspiration, Question, Gratitude'
      });
      return;
    }

    // Get authenticated user
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required'
      });
      return;
    }

    const supabaseClient = getSupabaseClient();

    try {
      // Create post in database
      const { data: post, error } = await supabaseClient
        .from('posts')
        .insert({
          user_id: req.user.id,
          content: content.trim(),
          post_type: finalPostType,
          image_url: image_url || null
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create post', {
          error: error.message,
          userId: req.user.id,
          content: content.substring(0, 50) + '...',
          postType: finalPostType,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to create post'
        });
        return;
      }

      logger.info('Post created successfully', {
        postId: post.id,
        userId: req.user.id,
        postType: finalPostType,
        contentLength: content.length,
        requestId: req.requestId
      });

      res.status(201).json({
        success: true,
        message: 'Post created successfully',
        post: post
      });

    } catch (error) {
      logger.error('Post creation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user.id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to create post'
      });
    }
  }),

  /**
   * Get Posts Feed Handler
   * GET /api/posts
   */
  getPosts: asyncErrorHandler(async (req: Request, res: Response) => {
    const { page = '1', limit = '10', post_type } = req.query;
    
    // Parse and validate pagination parameters
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      res.status(400).json({
        success: false,
        error: 'page must be a positive integer'
      });
      return;
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      res.status(400).json({
        success: false,
        error: 'limit must be between 1 and 50'
      });
      return;
    }

    // Validate post_type filter if provided
    if (post_type) {
      const validPostTypes: PostType[] = ['Recovery Update', 'Milestone', 'Inspiration', 'Question', 'Gratitude'];
      if (!validPostTypes.includes(post_type as PostType)) {
        res.status(400).json({
          success: false,
          error: 'invalid post_type filter'
        });
        return;
      }
    }

    const supabaseClient = getSupabaseClient();
    const offset = (pageNum - 1) * limitNum;

    try {
      // Build query
      let query = supabaseClient
        .from('posts')
        .select(`
          id,
          user_id,
          content,
          post_type,
          image_url,
          likes_count,
          comments_count,
          created_at,
          updated_at,
          user:users!posts_user_id_fkey (
            id,
            username,
            display_name,
            profile_picture_url
          )
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limitNum - 1);

      // Apply post_type filter if provided
      if (post_type) {
        query = query.eq('post_type', post_type);
      }

      const { data: posts, error, count } = await query;

      if (error) {
        logger.error('Failed to fetch posts', {
          error: error.message,
          page: pageNum,
          limit: limitNum,
          postType: post_type,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to fetch posts'
        });
        return;
      }

      // Calculate pagination metadata
      const totalPages = count ? Math.ceil(count / limitNum) : 0;
      const hasNextPage = pageNum < totalPages;
      const hasPrevPage = pageNum > 1;

      logger.info('Posts fetched successfully', {
        count: posts?.length || 0,
        page: pageNum,
        limit: limitNum,
        totalPages,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        posts: posts || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count || 0,
          totalPages,
          hasNextPage,
          hasPrevPage
        }
      });

    } catch (error) {
      logger.error('Posts fetch error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        page: pageNum,
        limit: limitNum,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to fetch posts'
      });
    }
  }),

  /**
   * Get Single Post Handler
   * GET /api/posts/:id
   */
  getPost: asyncErrorHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(400).json({
        success: false,
        error: 'invalid post ID format'
      });
      return;
    }

    const supabaseClient = getSupabaseClient();

    try {
      const { data: post, error } = await supabaseClient
        .from('posts')
        .select(`
          id,
          user_id,
          content,
          post_type,
          image_url,
          likes_count,
          comments_count,
          created_at,
          updated_at,
          user:users!posts_user_id_fkey (
            id,
            username,
            display_name,
            profile_picture_url
          )
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // Not found
          res.status(404).json({
            success: false,
            error: 'post not found'
          });
          return;
        }

        logger.error('Failed to fetch post', {
          error: error.message,
          postId: id,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to fetch post'
        });
        return;
      }

      logger.info('Post fetched successfully', {
        postId: id,
        userId: post.user_id,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        post: post
      });

    } catch (error) {
      logger.error('Post fetch error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId: id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to fetch post'
      });
    }
  }),

  /**
   * Update Post Handler
   * PUT /api/posts/:id
   */
  update: asyncErrorHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { content, post_type, image_url }: UpdatePostRequest = req.body;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(400).json({
        success: false,
        error: 'invalid post ID format'
      });
      return;
    }

    // Get authenticated user
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required'
      });
      return;
    }

    // Validate update data
    if (!content && !post_type && image_url === undefined) {
      res.status(400).json({
        success: false,
        error: 'at least one field must be provided for update'
      });
      return;
    }

    // Validate content if provided
    if (content !== undefined) {
      if (content.length > 500) {
        res.status(400).json({
          success: false,
          error: 'content must be 500 characters or less'
        });
        return;
      }

      if (content.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'content cannot be empty'
        });
        return;
      }
    }

    // Validate post_type if provided
    if (post_type) {
      const validPostTypes: PostType[] = ['Recovery Update', 'Milestone', 'Inspiration', 'Question', 'Gratitude'];
      if (!validPostTypes.includes(post_type)) {
        res.status(400).json({
          success: false,
          error: 'invalid post_type'
        });
        return;
      }
    }

    const supabaseClient = getSupabaseClient();

    try {
      // First check if post exists and user owns it
      const { data: existingPost, error: fetchError } = await supabaseClient
        .from('posts')
        .select('id, user_id')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') { // Not found
          res.status(404).json({
            success: false,
            error: 'post not found'
          });
          return;
        }

        logger.error('Failed to fetch post for update', {
          error: fetchError.message,
          postId: id,
          userId: req.user.id,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to update post'
        });
        return;
      }

      // Check authorization - user can only update their own posts
      if (existingPost.user_id !== req.user.id) {
        logger.warn('Unauthorized post update attempt', {
          postId: id,
          postOwnerId: existingPost.user_id,
          attemptedBy: req.user.id,
          requestId: req.requestId
        });

        res.status(403).json({
          success: false,
          error: 'you can only update your own posts'
        });
        return;
      }

      // Build update object
      const updateData: Partial<Post> = {};
      if (content !== undefined) updateData.content = content.trim();
      if (post_type !== undefined) updateData.post_type = post_type;
      if (image_url !== undefined) updateData.image_url = image_url;

      // Update post
      const { data: updatedPost, error: updateError } = await supabaseClient
        .from('posts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        logger.error('Failed to update post', {
          error: updateError.message,
          postId: id,
          userId: req.user.id,
          updateData,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to update post'
        });
        return;
      }

      logger.info('Post updated successfully', {
        postId: id,
        userId: req.user.id,
        updatedFields: Object.keys(updateData),
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        message: 'Post updated successfully',
        post: updatedPost
      });

    } catch (error) {
      logger.error('Post update error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId: id,
        userId: req.user.id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to update post'
      });
    }
  }),

  /**
   * Delete Post Handler
   * DELETE /api/posts/:id
   */
  delete: asyncErrorHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(400).json({
        success: false,
        error: 'invalid post ID format'
      });
      return;
    }

    // Get authenticated user
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required'
      });
      return;
    }

    const supabaseClient = getSupabaseClient();

    try {
      // First check if post exists and user owns it
      const { data: existingPost, error: fetchError } = await supabaseClient
        .from('posts')
        .select('id, user_id')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') { // Not found
          res.status(404).json({
            success: false,
            error: 'post not found'
          });
          return;
        }

        logger.error('Failed to fetch post for deletion', {
          error: fetchError.message,
          postId: id,
          userId: req.user.id,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to delete post'
        });
        return;
      }

      // Check authorization - user can only delete their own posts
      if (existingPost.user_id !== req.user.id) {
        logger.warn('Unauthorized post deletion attempt', {
          postId: id,
          postOwnerId: existingPost.user_id,
          attemptedBy: req.user.id,
          requestId: req.requestId
        });

        res.status(403).json({
          success: false,
          error: 'you can only delete your own posts'
        });
        return;
      }

      // Delete post
      const { error: deleteError } = await supabaseClient
        .from('posts')
        .delete()
        .eq('id', id);

      if (deleteError) {
        logger.error('Failed to delete post', {
          error: deleteError.message,
          postId: id,
          userId: req.user.id,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to delete post'
        });
        return;
      }

      logger.info('Post deleted successfully', {
        postId: id,
        userId: req.user.id,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        message: 'Post deleted successfully'
      });

    } catch (error) {
      logger.error('Post deletion error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        postId: id,
        userId: req.user.id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to delete post'
      });
    }
  })
};