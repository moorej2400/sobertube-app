/**
 * Feed Controller
 * Handles unified feed operations combining videos and posts
 */

import { Request, Response } from 'express';
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
  getPersonalizedFeed: asyncErrorHandler(async (req: Request, res: Response): Promise<void> => {
    // Get authenticated user
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'authentication required for personalized feed'
      });
      return;
    }

    const {
      limit: limitParam = '10',
      cursor,
      content_type = 'all',
      post_type,
      sort = 'chronological'
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

    const supabaseClient = getSupabaseClient();

    try {
      logger.info('Generating personalized feed', {
        userId: req.user.id,
        contentType: content_type,
        limit,
        requestId: req.requestId
      });

      // Get users that the current user follows
      const { data: followingData, error: followsError } = await supabaseClient
        .from('follows')
        .select('following_id')
        .eq('follower_id', req.user.id);

      if (followsError) {
        logger.error('Failed to fetch user follows', {
          error: followsError.message,
          userId: req.user.id,
          requestId: req.requestId
        });
        throw followsError;
      }

      const followingIds = followingData?.map(follow => follow.following_id) || [];
      
      // If user follows no one, fall back to popular content with user's own content mixed in
      if (followingIds.length === 0) {
        logger.info('User follows no one, using fallback algorithm', {
          userId: req.user.id,
          requestId: req.requestId
        });
        
        await feedController.getPersonalizedFallbackFeed(req, res, limit, cursor as string, content_type as string, post_type as string);
        return;
      }

      // Include user's own content in the feed
      const userIdsForFeed = [...followingIds, req.user.id];

      // Get personalized feed content from followed users + own content
      const personalizedFeed = await feedController.getContentFromUsers(
        userIdsForFeed,
        limit,
        cursor as string,
        content_type as string,
        post_type as string,
        sort as string
      );

      // If personalized feed has insufficient content, mix with popular content
      if (personalizedFeed.items.length < limit) {
        const remainingLimit = limit - personalizedFeed.items.length;
        logger.info('Mixing personalized content with popular content', {
          personalizedCount: personalizedFeed.items.length,
          remainingLimit,
          userId: req.user.id,
          requestId: req.requestId
        });

        const popularContent = await feedController.getPopularContent(
          remainingLimit,
          content_type as string,
          post_type as string,
          userIdsForFeed // Exclude content already in personalized feed
        );

        personalizedFeed.items = [...personalizedFeed.items, ...popularContent.items];
        personalizedFeed.has_more = personalizedFeed.has_more || popularContent.has_more;
      }

      logger.info('Personalized feed generated successfully', {
        userId: req.user.id,
        itemCount: personalizedFeed.items.length,
        followingCount: followingIds.length,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        data: personalizedFeed.items,
        pagination: {
          limit,
          next_cursor: personalizedFeed.next_cursor,
          has_more: personalizedFeed.has_more
        },
        personalization: {
          following_count: followingIds.length,
          personalized_items: Math.min(personalizedFeed.items.length, limit),
          algorithm: followingIds.length > 0 ? 'follows_based' : 'fallback'
        }
      });

    } catch (error) {
      logger.error('Personalized feed generation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user.id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'failed to generate personalized feed'
      });
    }
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
  }),

  /**
   * Helper function: Get content from specific users (for personalized feed)
   */
  async getContentFromUsers(
    userIds: string[],
    limit: number,
    cursor?: string,
    contentType: string = 'all',
    postType?: string,
    sort: string = 'chronological'
  ) {
    const supabaseClient = getSupabaseClient();
    const items: FeedItem[] = [];

    try {
      // Build posts query if needed
      if (contentType === 'all' || contentType === 'posts') {
        let postsQuery = supabaseClient
          .from('posts')
          .select(`
            id,
            user_id,
            content,
            post_type,
            image_url,
            created_at,
            updated_at,
            likes_count,
            comments_count,
            user:users!posts_user_id_fkey (
              id,
              username,
              display_name,
              profile_picture_url
            )
          `)
          .in('user_id', userIds)
          .order('created_at', { ascending: false });

        if (postType) {
          postsQuery = postsQuery.eq('post_type', postType);
        }

        if (cursor && sort === 'chronological') {
          postsQuery = postsQuery.lt('created_at', cursor);
        }

        const { data: posts, error: postsError } = await postsQuery.limit(Math.ceil(limit / 2));

        if (postsError) throw postsError;

        // Transform posts to feed items
        posts?.forEach(post => {
          items.push({
            id: post.id,
            type: 'post',
            user_id: post.user_id,
            created_at: post.created_at,
            updated_at: post.updated_at,
            user: {
              id: post.user[0]?.id || post.user_id,
              username: post.user[0]?.username || 'unknown',
              display_name: post.user[0]?.display_name,
              profile_picture_url: post.user[0]?.profile_picture_url
            },
            content: post.content,
            post_type: post.post_type,
            image_url: post.image_url,
            likes_count: post.likes_count || 0,
            comments_count: post.comments_count || 0
          });
        });
      }

      // Build videos query if needed
      if (contentType === 'all' || contentType === 'videos') {
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
            created_at,
            updated_at,
            likes_count,
            comments_count,
            views_count,
            user:users!videos_user_id_fkey (
              id,
              username,
              display_name,
              profile_picture_url
            )
          `)
          .in('user_id', userIds)
          .eq('status', 'ready')
          .order('created_at', { ascending: false });

        if (cursor && sort === 'chronological') {
          videosQuery = videosQuery.lt('created_at', cursor);
        }

        const { data: videos, error: videosError } = await videosQuery.limit(Math.ceil(limit / 2));

        if (videosError) throw videosError;

        // Transform videos to feed items
        videos?.forEach(video => {
          items.push({
            id: video.id,
            type: 'video',
            user_id: video.user_id,
            created_at: video.created_at,
            updated_at: video.updated_at,
            user: {
              id: video.user[0]?.id || video.user_id,
              username: video.user[0]?.username || 'unknown',
              display_name: video.user[0]?.display_name,
              profile_picture_url: video.user[0]?.profile_picture_url
            },
            title: video.title,
            description: video.description,
            video_url: video.video_url,
            thumbnail_url: video.thumbnail_url,
            duration: video.duration,
            file_size: video.file_size,
            format: video.format,
            likes_count: video.likes_count || 0,
            comments_count: video.comments_count || 0,
            views_count: video.views_count || 0
          });
        });
      }

      // Sort combined results
      items.sort((a, b) => {
        if (sort === 'chronological') {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        // Add trending sort logic here in future
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      // Trim to limit and determine pagination
      const limitedItems = items.slice(0, limit);
      const hasMore = items.length > limit;
      const nextCursor = hasMore && limitedItems.length > 0 
        ? limitedItems[limitedItems.length - 1].created_at 
        : null;

      return {
        items: limitedItems,
        next_cursor: nextCursor,
        has_more: hasMore
      };

    } catch (error) {
      logger.error('Error fetching content from users', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userIds,
        contentType
      });
      throw error;
    }
  },

  /**
   * Helper function: Get fallback feed for users with no follows
   */
  async getPersonalizedFallbackFeed(
    req: Request,
    res: Response,
    limit: number,
    cursor?: string,
    contentType: string = 'all',
    postType?: string
  ) {
    // Mix user's own content with popular content
    const userContent = await feedController.getContentFromUsers(
      [req.user!.id],
      Math.ceil(limit * 0.3), // 30% user's own content
      cursor,
      contentType,
      postType
    );

    const popularContent = await feedController.getPopularContent(
      limit - userContent.items.length,
      contentType,
      postType,
      [req.user!.id] // Exclude user's own content to avoid duplicates
    );

    const combinedItems = [...userContent.items, ...popularContent.items];
    
    // Sort combined results chronologically
    combinedItems.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const limitedItems = combinedItems.slice(0, limit);
    const hasMore = combinedItems.length > limit || userContent.has_more || popularContent.has_more;
    const nextCursor = limitedItems.length > 0 
      ? limitedItems[limitedItems.length - 1].created_at 
      : null;

    return res.status(200).json({
      success: true,
      data: limitedItems,
      pagination: {
        limit,
        next_cursor: nextCursor,
        has_more: hasMore
      },
      personalization: {
        following_count: 0,
        personalized_items: limitedItems.length,
        algorithm: 'fallback_mixed'
      }
    });
  },

  /**
   * Helper function: Get popular content (excluding specific users)
   */
  async getPopularContent(
    limit: number,
    contentType: string = 'all',
    postType?: string,
    excludeUserIds: string[] = []
  ) {
    const supabaseClient = getSupabaseClient();
    const items: FeedItem[] = [];

    try {
      // Get popular posts (high likes/comments in last 7 days)
      if (contentType === 'all' || contentType === 'posts') {
        let postsQuery = supabaseClient
          .from('posts')
          .select(`
            id,
            user_id,
            content,
            post_type,
            image_url,
            created_at,
            updated_at,
            likes_count,
            comments_count,
            user:users!posts_user_id_fkey (
              id,
              username,
              display_name,
              profile_picture_url
            )
          `)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('likes_count', { ascending: false })
          .order('comments_count', { ascending: false });

        if (postType) {
          postsQuery = postsQuery.eq('post_type', postType);
        }

        if (excludeUserIds.length > 0) {
          postsQuery = postsQuery.not('user_id', 'in', `(${excludeUserIds.join(',')})`);
        }

        const { data: posts, error: postsError } = await postsQuery.limit(Math.ceil(limit / 2));

        if (postsError) throw postsError;

        posts?.forEach(post => {
          items.push({
            id: post.id,
            type: 'post',
            user_id: post.user_id,
            created_at: post.created_at,
            updated_at: post.updated_at,
            user: {
              id: post.user[0]?.id || post.user_id,
              username: post.user[0]?.username || 'unknown',
              display_name: post.user[0]?.display_name,
              profile_picture_url: post.user[0]?.profile_picture_url
            },
            content: post.content,
            post_type: post.post_type,
            image_url: post.image_url,
            likes_count: post.likes_count || 0,
            comments_count: post.comments_count || 0
          });
        });
      }

      // Get popular videos (high likes/views in last 7 days)
      if (contentType === 'all' || contentType === 'videos') {
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
            created_at,
            updated_at,
            likes_count,
            comments_count,
            views_count,
            user:users!videos_user_id_fkey (
              id,
              username,
              display_name,
              profile_picture_url
            )
          `)
          .eq('status', 'ready')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('views_count', { ascending: false })
          .order('likes_count', { ascending: false });

        if (excludeUserIds.length > 0) {
          videosQuery = videosQuery.not('user_id', 'in', `(${excludeUserIds.join(',')})`);
        }

        const { data: videos, error: videosError } = await videosQuery.limit(Math.ceil(limit / 2));

        if (videosError) throw videosError;

        videos?.forEach(video => {
          items.push({
            id: video.id,
            type: 'video',
            user_id: video.user_id,
            created_at: video.created_at,
            updated_at: video.updated_at,
            user: {
              id: video.user[0]?.id || video.user_id,
              username: video.user[0]?.username || 'unknown',
              display_name: video.user[0]?.display_name,
              profile_picture_url: video.user[0]?.profile_picture_url
            },
            title: video.title,
            description: video.description,
            video_url: video.video_url,
            thumbnail_url: video.thumbnail_url,
            duration: video.duration,
            file_size: video.file_size,
            format: video.format,
            likes_count: video.likes_count || 0,
            comments_count: video.comments_count || 0,
            views_count: video.views_count || 0
          });
        });
      }

      // Sort by engagement score (likes + comments + views)
      items.sort((a, b) => {
        const scoreA = (a.likes_count || 0) + (a.comments_count || 0) + (a.views_count || 0);
        const scoreB = (b.likes_count || 0) + (b.comments_count || 0) + (b.views_count || 0);
        return scoreB - scoreA;
      });

      const limitedItems = items.slice(0, limit);
      const hasMore = items.length > limit;

      return {
        items: limitedItems,
        has_more: hasMore
      };

    } catch (error) {
      logger.error('Error fetching popular content', {
        error: error instanceof Error ? error.message : 'Unknown error',
        contentType,
        excludeUserIds
      });
      throw error;
    }
  }
};