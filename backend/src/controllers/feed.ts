/**
 * Feed Controller
 * Handles unified feed operations combining videos and posts
 */

import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../services/supabase';
import { logger } from '../utils/logger';
import { asyncErrorHandler } from '../middleware/errorHandler';
import { PostType } from '../types/supabase';

/**
 * Unified feed item type
 */
export interface FeedItem {
  id: string;
  type: 'post' | 'video';
  user_id: string;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    username: string;
    display_name?: string;
    profile_picture_url?: string;
  };
  // Post-specific fields
  content?: string;
  post_type?: PostType;
  image_url?: string;
  // Video-specific fields
  title?: string;
  description?: string;
  video_url?: string;
  thumbnail_url?: string;
  duration?: number;
  file_size?: number;
  format?: string;
  // Common interaction fields
  likes_count: number;
  comments_count: number;
  views_count?: number; // Only for videos
}

/**
 * Feed query parameters
 */
export interface FeedQueryParams {
  limit: number;
  cursor?: string;
  content_type?: 'all' | 'posts' | 'videos';
  post_type?: PostType;
  sort?: 'chronological' | 'trending';
  user_id?: string; // For filtering by specific user
}

export const feedController = {
  /**
   * Get Unified Feed Handler
   * GET /api/feed
   */
  getFeed: asyncErrorHandler(async (req: Request, res: Response) => {
    const {
      limit: limitParam = '10',
      cursor,
      content_type = 'all',
      post_type,
      sort = 'chronological',
      user_id
    } = req.query;

    // Parse and validate parameters
    const limit = Math.min(50, Math.max(1, parseInt(limitParam as string, 10) || 10));
    
    if (isNaN(limit)) {
      res.status(400).json({
        success: false,
        error: 'limit must be a positive integer'
      });
      return;
    }

    // Validate content_type
    const validContentTypes = ['all', 'posts', 'videos'];
    if (!validContentTypes.includes(content_type as string)) {
      res.status(400).json({
        success: false,
        error: 'content_type must be one of: all, posts, videos'
      });
      return;
    }

    // Validate post_type if provided
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

    // Validate sort parameter
    const validSortOptions = ['chronological', 'trending'];
    if (!validSortOptions.includes(sort as string)) {
      res.status(400).json({
        success: false,
        error: 'sort must be one of: chronological, trending'
      });
      return;
    }

    // Validate user_id if provided
    if (user_id) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(user_id as string)) {
        res.status(400).json({
          success: false,
          error: 'invalid user_id format'
        });
        return;
      }
    }

    const supabaseClient = getSupabaseClient();

    try {
      const feedItems: FeedItem[] = [];
      let nextCursor: string | null = null;

      // Parse cursor for pagination
      let cursorDate: string | undefined;
      if (cursor) {
        try {
          const decodedCursor = Buffer.from(cursor as string, 'base64').toString();
          cursorDate = decodedCursor;
          // Validate ISO date format
          new Date(cursorDate).toISOString();
        } catch (error) {
          res.status(400).json({
            success: false,
            error: 'invalid cursor format'
          });
          return;
        }
      }

      // Fetch posts if requested
      if (content_type === 'all' || content_type === 'posts') {
        let postsQuery = supabaseClient
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
          .limit(limit + 1); // Fetch one extra to determine if there are more items

        // Apply filters
        if (cursorDate) {
          postsQuery = postsQuery.lt('created_at', cursorDate);
        }
        if (post_type) {
          postsQuery = postsQuery.eq('post_type', post_type);
        }
        if (user_id) {
          postsQuery = postsQuery.eq('user_id', user_id);
        }

        const { data: posts, error: postsError } = await postsQuery;

        if (postsError) {
          logger.error('Failed to fetch posts for feed', {
            error: postsError.message,
            requestId: req.requestId
          });

          res.status(500).json({
            success: false,
            error: 'failed to fetch feed'
          });
          return;
        }

        // Convert posts to feed items
        if (posts) {
          for (const post of posts) {
            feedItems.push({
              id: post.id,
              type: 'post',
              user_id: post.user_id,
              content: post.content,
              post_type: post.post_type,
              image_url: post.image_url,
              likes_count: post.likes_count,
              comments_count: post.comments_count,
              created_at: post.created_at,
              updated_at: post.updated_at,
              user: Array.isArray(post.user) ? post.user[0] : post.user
            });
          }
        }
      }

      // Fetch videos if requested
      if (content_type === 'all' || content_type === 'videos') {
        let videosQuery = supabaseClient
          .from('videos')
          .select(`
            id,
            user_id,
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
            updated_at,
            user:users!videos_user_id_fkey (
              id,
              username,
              display_name,
              profile_picture_url
            )
          `)
          .eq('status', 'ready') // Only show ready videos
          .order('created_at', { ascending: false })
          .limit(limit + 1); // Fetch one extra to determine if there are more items

        // Apply filters
        if (cursorDate) {
          videosQuery = videosQuery.lt('created_at', cursorDate);
        }
        if (user_id) {
          videosQuery = videosQuery.eq('user_id', user_id);
        }

        const { data: videos, error: videosError } = await videosQuery;

        if (videosError) {
          logger.error('Failed to fetch videos for feed', {
            error: videosError.message,
            requestId: req.requestId
          });

          res.status(500).json({
            success: false,
            error: 'failed to fetch feed'
          });
          return;
        }

        // Convert videos to feed items
        if (videos) {
          for (const video of videos) {
            feedItems.push({
              id: video.id,
              type: 'video',
              user_id: video.user_id,
              title: video.title,
              description: video.description,
              video_url: video.video_url,
              thumbnail_url: video.thumbnail_url,
              duration: video.duration,
              file_size: video.file_size,
              format: video.format,
              views_count: video.views_count,
              likes_count: video.likes_count,
              comments_count: video.comments_count,
              created_at: video.created_at,
              updated_at: video.updated_at,
              user: Array.isArray(video.user) ? video.user[0] : video.user
            });
          }
        }
      }

      // Sort feed items
      if (sort === 'chronological') {
        feedItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (sort === 'trending') {
        // Simple trending algorithm: sort by engagement score (likes + comments + views)
        feedItems.sort((a, b) => {
          const scoreA = a.likes_count + a.comments_count + (a.views_count || 0);
          const scoreB = b.likes_count + b.comments_count + (b.views_count || 0);
          return scoreB - scoreA;
        });
      }

      // Apply limit and determine if there are more items
      const hasMore = feedItems.length > limit;
      const itemsToReturn = feedItems.slice(0, limit);

      // Generate next cursor if there are more items
      if (hasMore && itemsToReturn.length > 0) {
        const lastItem = itemsToReturn[itemsToReturn.length - 1];
        nextCursor = Buffer.from(lastItem.created_at).toString('base64');
      }

      logger.info('Feed fetched successfully', {
        count: itemsToReturn.length,
        contentType: content_type,
        sort,
        hasMore,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        data: itemsToReturn,
        pagination: {
          limit,
          has_more: hasMore,
          next_cursor: nextCursor
        },
        metadata: {
          content_type,
          sort,
          total_returned: itemsToReturn.length,
          filters_applied: {
            post_type: post_type || null,
            user_id: user_id || null
          }
        }
      });

    } catch (error) {
      logger.error('Feed fetch error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to fetch feed'
      });
    }
  }),

  /**
   * Get Personalized Feed Handler (for authenticated users)
   * GET /api/feed/personalized
   */
  getPersonalizedFeed: asyncErrorHandler(async (req: Request, res: Response) => {
    // Get authenticated user
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required for personalized feed'
      });
      return;
    }

    // For now, this is a placeholder for future personalization features
    // In the future, this would consider:
    // - Users that the current user follows
    // - Content preferences
    // - Engagement history
    // - Recovery milestones and interests

    logger.info('Personalized feed requested (falling back to general feed)', {
      userId: req.user.id,
      requestId: req.requestId
    });

    // For now, return the general feed
    // In future implementations, this would add personalization logic
    // Forward the request to the general feed with the same parameters
    // In future implementations, this would add personalization logic
    return feedController.getFeed(req, res, {} as NextFunction);
  }),

  /**
   * Get Feed Statistics Handler
   * GET /api/feed/stats
   */
  getFeedStats: asyncErrorHandler(async (req: Request, res: Response) => {
    const supabaseClient = getSupabaseClient();

    try {
      // Get total counts
      const [
        { count: totalPosts, error: postsCountError },
        { count: totalVideos, error: videosCountError },
        { count: totalUsers, error: usersCountError }
      ] = await Promise.all([
        supabaseClient.from('posts').select('*', { count: 'exact', head: true }),
        supabaseClient.from('videos').select('*', { count: 'exact', head: true }).eq('status', 'ready'),
        supabaseClient.from('users').select('*', { count: 'exact', head: true })
      ]);

      if (postsCountError || videosCountError || usersCountError) {
        logger.error('Failed to fetch feed statistics', {
          postsError: postsCountError?.message,
          videosError: videosCountError?.message,
          usersError: usersCountError?.message,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'failed to fetch feed statistics'
        });
        return;
      }

      // Get recent activity (last 24 hours)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [
        { count: recentPosts },
        { count: recentVideos }
      ] = await Promise.all([
        supabaseClient
          .from('posts')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', yesterday),
        supabaseClient
          .from('videos')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ready')
          .gte('created_at', yesterday)
      ]);

      logger.info('Feed statistics fetched successfully', {
        totalPosts,
        totalVideos,
        totalUsers,
        recentPosts,
        recentVideos,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        statistics: {
          total_content: (totalPosts || 0) + (totalVideos || 0),
          total_posts: totalPosts || 0,
          total_videos: totalVideos || 0,
          total_users: totalUsers || 0,
          recent_activity: {
            posts_24h: recentPosts || 0,
            videos_24h: recentVideos || 0,
            total_24h: (recentPosts || 0) + (recentVideos || 0)
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Feed statistics error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to fetch feed statistics'
      });
    }
  })
};