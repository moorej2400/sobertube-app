/**
 * Feed Updates Service
 * Handles real-time feed content updates, batching, and personalization
 */

import { getSupabaseClient } from './supabase';
import { webSocketEventsService } from './websocketEvents';
import { logger } from '../utils/logger';
import { 
  FeedUpdatePayload, 
  PriorityFeedUpdatePayload
} from '../websocket/types';

export class FeedUpdatesService {
  private static instance: FeedUpdatesService;
  private readonly MAX_BATCH_SIZE = 100;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): FeedUpdatesService {
    if (!FeedUpdatesService.instance) {
      FeedUpdatesService.instance = new FeedUpdatesService();
    }
    return FeedUpdatesService.instance;
  }

  /**
   * Notify followers when a new post is created
   */
  public async notifyFollowersOfNewPost(
    post: any, 
    authorUsername: string
  ): Promise<void> {
    try {
      const supabaseClient = getSupabaseClient();

      // Get all followers of the post author
      const { data: followers, error } = await supabaseClient
        .from('follows')
        .select('follower_id')
        .eq('following_id', post.user_id);

      if (error) {
        logger.error('Failed to notify followers of new post', {
          component: 'FeedUpdatesService',
          error: error.message,
          postId: post.id,
          authorId: post.user_id
        });
        throw new Error(error.message);
      }

      if (!followers || followers.length === 0) {
        logger.info('No followers to notify for new post', {
          component: 'FeedUpdatesService',
          postId: post.id,
          authorId: post.user_id
        });
        return;
      }

      const feedUpdate: FeedUpdatePayload = {
        postId: post.id,
        authorId: post.user_id,
        authorUsername,
        content: post.content,
        createdAt: new Date(post.created_at),
        type: 'new_post',
        postType: post.post_type,
        mediaUrl: post.image_url
      };

      const followerIds = followers.map(f => f.follower_id);

      // Use batch emit for efficiency
      await webSocketEventsService.batchEmitFeedUpdates(followerIds, feedUpdate);

      logger.info('Successfully notified followers of new post', {
        component: 'FeedUpdatesService',
        postId: post.id,
        authorId: post.user_id,
        followerCount: followerIds.length
      });

    } catch (error) {
      logger.error('Error in notifyFollowersOfNewPost', {
        component: 'FeedUpdatesService',
        error: error instanceof Error ? error.message : 'Unknown error',
        postId: post.id,
        authorId: post.user_id
      });
      throw error;
    }
  }

  /**
   * Process instant feed refresh for specific users
   */
  public async processInstantFeedRefresh(
    userIds: string[], 
    feedUpdate: FeedUpdatePayload
  ): Promise<void> {
    try {
      if (!userIds || userIds.length === 0) {
        logger.info('No users to refresh for instant feed update', {
          component: 'FeedUpdatesService',
          postId: feedUpdate.postId
        });
        return;
      }

      await webSocketEventsService.batchEmitFeedUpdates(userIds, feedUpdate);

      logger.info('Instant feed refresh processed', {
        component: 'FeedUpdatesService',
        userCount: userIds.length,
        postId: feedUpdate.postId,
        updateType: feedUpdate.type
      });

    } catch (error) {
      logger.error('Error in processInstantFeedRefresh', {
        component: 'FeedUpdatesService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userCount: userIds.length
      });
      throw error;
    }
  }

  /**
   * Process multiple feed updates as a batch
   */
  public async processFeedUpdateBatch(
    userIds: string[], 
    feedUpdates: FeedUpdatePayload[]
  ): Promise<void> {
    try {
      if (feedUpdates.length > this.MAX_BATCH_SIZE) {
        throw new Error(`Feed update batch size exceeds maximum limit of ${this.MAX_BATCH_SIZE}`);
      }

      if (!userIds || userIds.length === 0) {
        logger.info('No users to process for feed update batch', {
          component: 'FeedUpdatesService',
          updateCount: feedUpdates.length
        });
        return;
      }

      await webSocketEventsService.batchEmitFeedUpdates(userIds, feedUpdates);

      logger.info('Feed update batch processed', {
        component: 'FeedUpdatesService',
        userCount: userIds.length,
        updateCount: feedUpdates.length
      });

    } catch (error) {
      logger.error('Error in processFeedUpdateBatch', {
        component: 'FeedUpdatesService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userCount: userIds.length,
        updateCount: feedUpdates.length
      });
      throw error;
    }
  }

  /**
   * Process priority feed updates for active users
   */
  public async processPriorityFeedUpdate(
    allUserIds: string[],
    activeUserIds: string[],
    feedUpdate: PriorityFeedUpdatePayload
  ): Promise<void> {
    try {
      // Send high priority updates to active users first
      if (activeUserIds.length > 0) {
        await webSocketEventsService.emitPriorityFeedUpdate(
          activeUserIds, 
          feedUpdate, 
          feedUpdate.priority
        );
      }

      // Send normal priority updates to inactive users
      const inactiveUserIds = allUserIds.filter(id => !activeUserIds.includes(id));
      if (inactiveUserIds.length > 0) {
        const normalPriorityUpdate = { ...feedUpdate, priority: 'normal' as const };
        await webSocketEventsService.emitFeedUpdate(inactiveUserIds, normalPriorityUpdate);
      }

      logger.info('Priority feed update processed', {
        component: 'FeedUpdatesService',
        totalUsers: allUserIds.length,
        activeUsers: activeUserIds.length,
        inactiveUsers: inactiveUserIds.length,
        priority: feedUpdate.priority
      });

    } catch (error) {
      logger.error('Error in processPriorityFeedUpdate', {
        component: 'FeedUpdatesService',
        error: error instanceof Error ? error.message : 'Unknown error',
        totalUsers: allUserIds.length,
        activeUsers: activeUserIds.length
      });
      throw error;
    }
  }

  /**
   * Resolve conflicts between concurrent feed updates
   */
  public async resolveFeedUpdateConflicts(
    conflictingUpdates: Array<{
      postId: string;
      authorId: string;
      timestamp: Date;
      type: 'new_post' | 'trending' | 'recommended';
    }>
  ): Promise<{ postId: string; authorId: string; timestamp: Date; type: 'new_post' | 'trending' | 'recommended' }> {
    try {
      if (conflictingUpdates.length <= 1) {
        return conflictingUpdates[0];
      }

      // Resolution strategy: prioritize most recent update
      const resolvedUpdate = conflictingUpdates.reduce((latest, current) => 
        current.timestamp > latest.timestamp ? current : latest
      );

      logger.info('Feed update conflicts resolved', {
        component: 'FeedUpdatesService',
        postId: resolvedUpdate.postId,
        conflictCount: conflictingUpdates.length,
        resolvedType: resolvedUpdate.type,
        resolutionStrategy: 'most_recent'
      });

      return resolvedUpdate;

    } catch (error) {
      logger.error('Error in resolveFeedUpdateConflicts', {
        component: 'FeedUpdatesService',
        error: error instanceof Error ? error.message : 'Unknown error',
        conflictCount: conflictingUpdates.length
      });
      throw error;
    }
  }

  /**
   * Generate personalized feed updates based on user preferences
   */
  public async generatePersonalizedFeedUpdates(
    userId: string, 
    limit: number = 10
  ): Promise<FeedUpdatePayload[]> {
    try {
      const supabaseClient = getSupabaseClient();

      // Get user preferences
      const { data: userPreferences, error: preferencesError } = await supabaseClient
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId);

      if (preferencesError) {
        throw new Error(preferencesError.message);
      }

      if (!userPreferences || userPreferences.length === 0) {
        logger.info('No user preferences found, using default feed algorithm', {
          component: 'FeedUpdatesService',
          userId
        });
        return [];
      }

      const preferences = userPreferences[0];
      
      // Get recent posts that match user preferences
      const { data: posts, error: postsError } = await supabaseClient
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit * 2); // Get more than needed for filtering

      if (postsError) {
        throw new Error(postsError.message);
      }

      // Filter and score posts based on user preferences
      const personalizedUpdates: FeedUpdatePayload[] = [];
      
      for (const post of posts || []) {
        let score = 0;

        // Score based on preferred post types
        if (preferences.preferred_post_types?.includes(post.post_type)) {
          score += 5;
        }

        // Score based on followed users
        if (preferences.followed_users?.includes(post.user_id)) {
          score += 10;
        }

        // Score based on engagement
        const engagementScore = (post.likes_count || 0) + (post.comments_count || 0) * 2;
        score += Math.min(engagementScore, 10);

        if (score > 5) { // Only include posts with reasonable scores
          personalizedUpdates.push({
            postId: post.id,
            authorId: post.user_id,
            authorUsername: 'Unknown', // Will be fetched separately if needed
            content: post.content,
            createdAt: new Date(post.created_at),
            type: 'recommended',
            personalizedScore: score,
            postType: post.post_type,
            mediaUrl: post.image_url
          });
        }
      }

      // Sort by personalized score and limit results
      personalizedUpdates.sort((a, b) => (b.personalizedScore || 0) - (a.personalizedScore || 0));
      const finalUpdates = personalizedUpdates.slice(0, limit);

      logger.info('Generated personalized feed updates', {
        component: 'FeedUpdatesService',
        userId,
        totalPosts: posts?.length || 0,
        personalizedCount: finalUpdates.length,
        avgScore: finalUpdates.reduce((sum, update) => sum + (update.personalizedScore || 0), 0) / finalUpdates.length
      });

      return finalUpdates;

    } catch (error) {
      logger.error('Error in generatePersonalizedFeedUpdates', {
        component: 'FeedUpdatesService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        limit
      });
      throw error;
    }
  }
}

// Export singleton instance
export const feedUpdatesService = FeedUpdatesService.getInstance();