/**
 * Follows Controller
 * Handles follow/unfollow operations for user relationships
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../services/supabase';
import { logger } from '../utils/logger';
import { asyncErrorHandler } from '../middleware/errorHandler';

/**
 * Follow request body interface
 */
export interface FollowRequest {
  following_id: string;
}

/**
 * Follow status response interface
 */
export interface FollowStatusResponse {
  user_id: string;
  following: boolean;
  is_mutual: boolean;
  follower_count: number;
  following_count: number;
}

/**
 * Toggle follow response interface
 */
export interface ToggleFollowResponse {
  success: boolean;
  following: boolean;
  follower_count: number;
  following_count: number;
  following_id: string;
}

/**
 * User follow list item interface
 */
export interface FollowListItem {
  follower_id?: string;
  following_id?: string;
  username: string;
  display_name: string;
  profile_picture_url: string;
  bio: string;
  followed_at: string;
  is_mutual: boolean;
}

export const followsController = {
  /**
   * Toggle Follow Handler (POST /api/follows)
   * Follow or unfollow user based on current status
   */
  toggleFollow: asyncErrorHandler(async (req: Request, res: Response) => {
    // Check authentication
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required'
      });
      return;
    }

    const { following_id }: FollowRequest = req.body;

    // Validate request body
    if (!following_id) {
      res.status(400).json({
        success: false,
        error: 'following_id is required'
      });
      return;
    }

    // Validate following_id format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(following_id)) {
      res.status(400).json({
        success: false,
        error: 'following_id must be a valid UUID'
      });
      return;
    }

    const supabaseClient = getSupabaseClient();
    const followerId = req.user.id;

    // Prevent self-follow
    if (followerId === following_id) {
      res.status(400).json({
        success: false,
        error: 'users cannot follow themselves'
      });
      return;
    }

    try {
      // Check if target user exists
      const { data: targetUser, error: userError } = await supabaseClient
        .from('users')
        .select('id, username')
        .eq('id', following_id)
        .single();

      if (userError || !targetUser) {
        res.status(404).json({
          success: false,
          error: 'user not found'
        });
        return;
      }

      // Use the toggle_follow database function for atomic operation
      const { data, error } = await supabaseClient
        .rpc('toggle_follow', {
          p_follower_id: followerId,
          p_following_id: following_id
        });

      if (error) {
        // Handle specific database errors
        if (error.message.includes('cannot follow themselves')) {
          res.status(400).json({
            success: false,
            error: 'users cannot follow themselves'
          });
          return;
        }

        logger.error('Database error in toggle_follow', {
          error: error.message,
          followerId,
          followingId: following_id,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to toggle follow'
        });
        return;
      }

      if (!data || data.length === 0) {
        res.status(500).json({
          success: false,
          error: 'failed to toggle follow'
        });
        return;
      }

      const result = data[0];
      const response: ToggleFollowResponse = {
        success: true,
        following: result.following,
        follower_count: result.follower_count,
        following_count: result.following_count,
        following_id
      };

      logger.info('Follow toggled successfully', {
        followerId,
        followingId: following_id,
        following: result.following,
        followerCount: result.follower_count,
        followingCount: result.following_count,
        requestId: req.requestId
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error('Toggle follow error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        followerId,
        followingId: following_id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to toggle follow'
      });
    }
  }),

  /**
   * Get Follow Status Handler (GET /api/follows/status)
   * Check if current user follows specified user
   */
  getFollowStatus: asyncErrorHandler(async (req: Request, res: Response) => {
    // Check authentication
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required'
      });
      return;
    }

    const { user_id } = req.query;

    // Validate query parameters
    if (!user_id) {
      res.status(400).json({
        success: false,
        error: 'user_id query parameter is required'
      });
      return;
    }

    // Validate user_id format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(user_id as string)) {
      res.status(400).json({
        success: false,
        error: 'user_id must be a valid UUID'
      });
      return;
    }

    const supabaseClient = getSupabaseClient();
    const currentUserId = req.user.id;

    try {
      // Use the get_follow_status database function
      const { data, error } = await supabaseClient
        .rpc('get_follow_status', {
          p_user_id: currentUserId,
          p_target_user_ids: [user_id]
        });

      if (error) {
        logger.error('Database error checking follow status', {
          error: error.message,
          currentUserId,
          targetUserId: user_id,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to check follow status'
        });
        return;
      }

      if (!data || data.length === 0) {
        res.status(404).json({
          success: false,
          error: 'user not found'
        });
        return;
      }

      const result = data[0];

      // Get follower and following counts for the target user
      const { data: userCounts, error: countsError } = await supabaseClient
        .from('users')
        .select('followers_count, following_count')
        .eq('id', user_id)
        .single();

      if (countsError) {
        logger.error('Database error getting user counts', {
          error: countsError.message,
          targetUserId: user_id,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to get user information'
        });
        return;
      }

      const response: FollowStatusResponse = {
        user_id: user_id as string,
        following: result.is_following,
        is_mutual: result.is_mutual,
        follower_count: userCounts?.followers_count || 0,
        following_count: userCounts?.following_count || 0
      };

      logger.info('Follow status retrieved successfully', {
        currentUserId,
        targetUserId: user_id,
        following: result.is_following,
        isMutual: result.is_mutual,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error('Get follow status error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        currentUserId,
        targetUserId: user_id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to check follow status'
      });
    }
  }),

  /**
   * Get User Following List Handler (GET /api/follows/following)
   * Get list of users that current user follows
   */
  getUserFollowing: asyncErrorHandler(async (req: Request, res: Response) => {
    // Check authentication
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required'
      });
      return;
    }

    const {
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

    const supabaseClient = getSupabaseClient();
    const userId = req.user.id;

    try {
      // Use the get_user_following database function
      const { data, error } = await supabaseClient
        .rpc('get_user_following', {
          p_user_id: userId,
          p_limit: limit,
          p_offset: offset
        });

      if (error) {
        logger.error('Database error getting user following', {
          error: error.message,
          userId,
          limit,
          offset,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to get following list'
        });
        return;
      }

      logger.info('User following list retrieved successfully', {
        userId,
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
      logger.error('Get user following error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to get following list'
      });
    }
  }),

  /**
   * Get User Followers List Handler (GET /api/follows/followers)
   * Get list of users following current user
   */
  getUserFollowers: asyncErrorHandler(async (req: Request, res: Response) => {
    // Check authentication
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required'
      });
      return;
    }

    const {
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

    const supabaseClient = getSupabaseClient();
    const userId = req.user.id;

    try {
      // Use the get_user_followers database function
      const { data, error } = await supabaseClient
        .rpc('get_user_followers', {
          p_user_id: userId,
          p_limit: limit,
          p_offset: offset
        });

      if (error) {
        logger.error('Database error getting user followers', {
          error: error.message,
          userId,
          limit,
          offset,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to get followers list'
        });
        return;
      }

      logger.info('User followers list retrieved successfully', {
        userId,
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
      logger.error('Get user followers error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to get followers list'
      });
    }
  })
};