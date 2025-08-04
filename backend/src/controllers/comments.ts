/**
 * Comments Controller
 * Handles CRUD operations for comments on videos and posts
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../services/supabase';
import { logger } from '../utils/logger';
import { asyncErrorHandler } from '../middleware/errorHandler';

/**
 * Comment request body interface for creating comments
 */
export interface CreateCommentRequest {
  content_type: 'video' | 'post';
  content_id: string;
  content: string;
  parent_comment_id?: string;
}

/**
 * Comment request body interface for updating comments
 */
export interface UpdateCommentRequest {
  content: string;
}

/**
 * Comment response interface
 */
export interface CommentResponse {
  id: string;
  user_id: string;
  username: string;
  display_name?: string;
  profile_picture_url?: string;
  content: string;
  likes_count: number;
  replies_count: number;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  parent_comment_id?: string;
}

/**
 * Comments list query parameters
 */
export interface CommentsQueryParams {
  content_type: 'video' | 'post';
  content_id: string;
  parent_comment_id?: string;
  limit: number;
  offset: number;
  sort_order: 'newest' | 'oldest' | 'most_liked';
}

export const commentsController = {
  /**
   * Create Comment Handler (POST /api/comments)
   * Create a new comment on video or post
   */
  createComment: asyncErrorHandler(async (req: Request, res: Response) => {
    // Check authentication
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required'
      });
      return;
    }

    const { content_type, content_id, content, parent_comment_id }: CreateCommentRequest = req.body;

    // Validate request body
    if (!content_type || !content_id || !content) {
      res.status(400).json({
        success: false,
        error: 'content_type, content_id, and content are required'
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

    // Validate parent_comment_id if provided
    if (parent_comment_id && !uuidRegex.test(parent_comment_id)) {
      res.status(400).json({
        success: false,
        error: 'parent_comment_id must be a valid UUID'
      });
      return;
    }

    // Validate content length
    if (content.trim().length === 0 || content.length > 2000) {
      res.status(400).json({
        success: false,
        error: 'comment content must be between 1 and 2000 characters'
      });
      return;
    }

    const supabaseClient = getSupabaseClient();
    const userId = req.user.id;

    try {
      // Use the create_comment database function
      const { data, error } = await supabaseClient
        .rpc('create_comment', {
          p_user_id: userId,
          p_content_type: content_type,
          p_content_id: content_id,
          p_content: content.trim(),
          p_parent_comment_id: parent_comment_id || null
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

        if (error.message.includes('Parent comment must belong to the same content')) {
          res.status(400).json({
            success: false,
            error: 'parent comment must belong to the same content'
          });
          return;
        }

        logger.error('Database error in create_comment', {
          error: error.message,
          userId,
          contentType: content_type,
          contentId: content_id,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to create comment'
        });
        return;
      }

      if (!data || data.length === 0) {
        res.status(500).json({
          success: false,
          error: 'failed to create comment'
        });
        return;
      }

      const comment = data[0];
      const response: CommentResponse = {
        id: comment.id,
        user_id: comment.user_id,
        username: comment.username,
        display_name: comment.display_name,
        profile_picture_url: comment.profile_picture_url,
        content: comment.content,
        likes_count: comment.likes_count,
        replies_count: comment.replies_count,
        is_edited: comment.is_edited,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        parent_comment_id: comment.parent_comment_id
      };

      logger.info('Comment created successfully', {
        commentId: comment.id,
        userId,
        contentType: content_type,
        contentId: content_id,
        isReply: !!parent_comment_id,
        requestId: req.requestId
      });

      res.status(201).json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error('Create comment error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        contentType: content_type,
        contentId: content_id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to create comment'
      });
    }
  }),

  /**
   * Get Comments Handler (GET /api/comments)
   * Get comments for specific content with pagination and threading
   */
  getComments: asyncErrorHandler(async (req: Request, res: Response) => {
    const {
      content_type,
      content_id,
      parent_comment_id,
      limit: limitParam = '20',
      offset: offsetParam = '0',
      sort_order = 'newest'
    } = req.query;

    // Validate required parameters
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

    // Validate parent_comment_id if provided
    if (parent_comment_id && !uuidRegex.test(parent_comment_id as string)) {
      res.status(400).json({
        success: false,
        error: 'parent_comment_id must be a valid UUID'
      });
      return;
    }

    // Parse and validate pagination parameters
    const limit = Math.min(100, Math.max(1, parseInt(limitParam as string, 10) || 20));
    const offset = Math.max(0, parseInt(offsetParam as string, 10) || 0);

    if (isNaN(limit) || isNaN(offset)) {
      res.status(400).json({
        success: false,
        error: 'limit and offset must be valid integers'
      });
      return;
    }

    // Validate sort_order
    const validSortOrders = ['newest', 'oldest', 'most_liked'];
    if (!validSortOrders.includes(sort_order as string)) {
      res.status(400).json({
        success: false,
        error: 'sort_order must be one of: newest, oldest, most_liked'
      });
      return;
    }

    const supabaseClient = getSupabaseClient();

    try {
      // Use the get_comments_for_content database function
      const { data, error } = await supabaseClient
        .rpc('get_comments_for_content', {
          p_content_type: content_type,
          p_content_id: content_id,
          p_parent_comment_id: parent_comment_id || null,
          p_limit: limit + 1, // Fetch one extra to determine if there are more
          p_offset: offset,
          p_sort_order: sort_order
        });

      if (error) {
        logger.error('Database error getting comments', {
          error: error.message,
          contentType: content_type,
          contentId: content_id,
          parentCommentId: parent_comment_id,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to get comments'
        });
        return;
      }

      // Determine if there are more comments
      const hasMore = (data?.length || 0) > limit;
      const commentsToReturn = data ? data.slice(0, limit) : [];

      const comments: CommentResponse[] = commentsToReturn.map(comment => ({
        id: comment.id,
        user_id: comment.user_id,
        username: comment.username,
        display_name: comment.display_name,
        profile_picture_url: comment.profile_picture_url,
        content: comment.content,
        likes_count: comment.likes_count,
        replies_count: comment.replies_count,
        is_edited: comment.is_edited,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        parent_comment_id: comment.parent_comment_id
      }));

      logger.info('Comments retrieved successfully', {
        contentType: content_type,
        contentId: content_id,
        parentCommentId: parent_comment_id,
        count: comments.length,
        limit,
        offset,
        sortOrder: sort_order,
        hasMore,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        data: comments,
        pagination: {
          limit,
          offset,
          has_more: hasMore,
          total_returned: comments.length
        },
        metadata: {
          content_type,
          content_id,
          parent_comment_id: parent_comment_id || null,
          sort_order
        }
      });

    } catch (error) {
      logger.error('Get comments error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        contentType: content_type,
        contentId: content_id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to get comments'
      });
    }
  }),

  /**
   * Update Comment Handler (PUT /api/comments/:id)
   * Update a comment (only by the comment author)
   */
  updateComment: asyncErrorHandler(async (req: Request, res: Response) => {
    // Check authentication
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required'
      });
      return;
    }

    const { id: commentId } = req.params;
    const { content }: UpdateCommentRequest = req.body;

    // Validate comment ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(commentId)) {
      res.status(400).json({
        success: false,
        error: 'comment ID must be a valid UUID'
      });
      return;
    }

    // Validate content
    if (!content) {
      res.status(400).json({
        success: false,
        error: 'content is required'
      });
      return;
    }

    // Validate content length
    if (content.trim().length === 0 || content.length > 2000) {
      res.status(400).json({
        success: false,
        error: 'comment content must be between 1 and 2000 characters'
      });
      return;
    }

    const supabaseClient = getSupabaseClient();
    const userId = req.user.id;

    try {
      // Use the update_comment database function
      const { data, error } = await supabaseClient
        .rpc('update_comment', {
          p_comment_id: commentId,
          p_user_id: userId,
          p_new_content: content.trim()
        });

      if (error) {
        logger.error('Database error updating comment', {
          error: error.message,
          commentId,
          userId,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to update comment'
        });
        return;
      }

      if (!data || data.length === 0) {
        // Comment not found or user doesn't own it
        res.status(404).json({
          success: false,
          error: 'comment not found or you do not have permission to update it'
        });
        return;
      }

      const comment = data[0];
      const response: CommentResponse = {
        id: comment.id,
        user_id: comment.user_id,
        username: comment.username,
        display_name: comment.display_name,
        profile_picture_url: comment.profile_picture_url,
        content: comment.content,
        likes_count: comment.likes_count,
        replies_count: comment.replies_count,
        is_edited: comment.is_edited,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        parent_comment_id: comment.parent_comment_id
      };

      logger.info('Comment updated successfully', {
        commentId,
        userId,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error('Update comment error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        commentId,
        userId,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to update comment'
      });
    }
  }),

  /**
   * Delete Comment Handler (DELETE /api/comments/:id)
   * Delete a comment (only by the comment author)
   */
  deleteComment: asyncErrorHandler(async (req: Request, res: Response) => {
    // Check authentication
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required'
      });
      return;
    }

    const { id: commentId } = req.params;

    // Validate comment ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(commentId)) {
      res.status(400).json({
        success: false,
        error: 'comment ID must be a valid UUID'
      });
      return;
    }

    const supabaseClient = getSupabaseClient();
    const userId = req.user.id;

    try {
      // Delete the comment (RLS policy ensures user can only delete their own)
      const { data, error } = await supabaseClient
        .from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', userId)
        .select('id, content_type, content_id, parent_comment_id');

      if (error) {
        logger.error('Database error deleting comment', {
          error: error.message,
          commentId,
          userId,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to delete comment'
        });
        return;
      }

      if (!data || data.length === 0) {
        // Comment not found or user doesn't own it
        res.status(404).json({
          success: false,
          error: 'comment not found or you do not have permission to delete it'
        });
        return;
      }

      const deletedComment = data[0];

      logger.info('Comment deleted successfully', {
        commentId,
        userId,
        contentType: deletedComment.content_type,
        contentId: deletedComment.content_id,
        wasReply: !!deletedComment.parent_comment_id,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        message: 'comment deleted successfully',
        data: {
          id: commentId,
          deleted_at: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Delete comment error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        commentId,
        userId,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to delete comment'
      });
    }
  })
};