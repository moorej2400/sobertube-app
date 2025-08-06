/**
 * Recommendation Engine Service
 * Handles real-time content recommendations, trending detection, and feedback processing
 */

import { getSupabaseClient } from './supabase';
import { webSocketEventsService } from './websocketEvents';
import { logger } from '../utils/logger';
import { 
  TrendingContentPayload
} from '../websocket/types';

export interface TrendingContentItem {
  postId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  engagementScore: number;
  type: 'trending';
  trendingRank: number;
  timeWindow: '1h' | '6h' | '24h';
  category?: string;
}

export interface RecommendationItem {
  postId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  createdAt: Date;
  type: 'recommended';
  personalizedScore: number;
  recommendationReason: string;
  fallbackToTrending?: boolean;
  mediaUrl?: string;
  postType?: string;
}

export class RecommendationEngine {
  private static instance: RecommendationEngine;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): RecommendationEngine {
    if (!RecommendationEngine.instance) {
      RecommendationEngine.instance = new RecommendationEngine();
    }
    return RecommendationEngine.instance;
  }

  /**
   * Detect trending content based on engagement metrics
   */
  public async detectTrendingContent(
    limit: number = 10,
    timeWindow: '1h' | '6h' | '24h' = '24h'
  ): Promise<TrendingContentItem[]> {
    try {
      const supabaseClient = getSupabaseClient();
      
      // Calculate the time window for trending detection
      const now = new Date();
      const hoursBack = timeWindow === '1h' ? 1 : timeWindow === '6h' ? 6 : 24;
      const startTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

      const { data: posts, error } = await supabaseClient
        .from('posts')
        .select(`
          id,
          user_id,
          content,
          post_type,
          created_at,
          likes_count,
          comments_count,
          views_count,
          engagement_score
        `)
        .gte('created_at', startTime.toISOString())
        .order('engagement_score', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Failed to detect trending content', {
          component: 'RecommendationEngine',
          error: error.message,
          timeWindow,
          limit
        });
        throw new Error(error.message);
      }

      if (!posts || posts.length === 0) {
        logger.info('No trending content found', {
          component: 'RecommendationEngine',
          timeWindow,
          limit
        });
        return [];
      }

      // Transform posts into trending content items
      const trendingContent: TrendingContentItem[] = posts.map((post, index) => ({
        postId: post.id,
        authorId: post.user_id,
        authorUsername: 'Unknown', // Will be fetched separately if needed
        content: post.content,
        engagementScore: post.engagement_score || 0,
        type: 'trending' as const,
        trendingRank: index + 1,
        timeWindow,
        category: post.post_type
      }));

      logger.info('Trending content detected', {
        component: 'RecommendationEngine',
        contentCount: trendingContent.length,
        timeWindow,
        topScore: trendingContent[0]?.engagementScore
      });

      return trendingContent;

    } catch (error) {
      logger.error('Error in detectTrendingContent', {
        component: 'RecommendationEngine',
        error: error instanceof Error ? error.message : 'Unknown error',
        timeWindow,
        limit
      });
      throw error;
    }
  }

  /**
   * Generate personalized recommendations for a specific user
   */
  public async generatePersonalizedRecommendations(
    userId: string, 
    limit: number = 5
  ): Promise<RecommendationItem[]> {
    try {
      const supabaseClient = getSupabaseClient();

      // Get user interaction history and preferences
      const { data: userHistory, error: historyError } = await supabaseClient
        .from('user_interaction_history')
        .select('*')
        .eq('user_id', userId);

      if (historyError) {
        throw new Error(historyError.message);
      }

      // If no user history, fall back to trending content
      if (!userHistory || userHistory.length === 0) {
        logger.info('No user history found, falling back to trending content', {
          component: 'RecommendationEngine',
          userId
        });

        const trendingContent = await this.detectTrendingContent(limit);
        return trendingContent.map(trending => ({
          postId: trending.postId,
          authorId: trending.authorId,
          authorUsername: trending.authorUsername,
          content: trending.content,
          createdAt: new Date(),
          type: 'recommended' as const,
          personalizedScore: trending.engagementScore / 10, // Normalize to 0-10 scale
          recommendationReason: 'Popular content',
          fallbackToTrending: true
        }));
      }

      const history = userHistory[0];

      // Get recommended posts based on user preferences
      const { data: posts, error: postsError } = await supabaseClient
        .from('posts')
        .select('*')
        .in('post_type', history.liked_post_types || [])
        .order('created_at', { ascending: false })
        .limit(limit * 2); // Get more than needed for filtering

      if (postsError) {
        throw new Error(postsError.message);
      }

      // Score and filter posts
      const recommendations: RecommendationItem[] = [];
      
      for (const post of posts || []) {
        let score = 0;
        let reason = '';

        // Score based on post type preference
        if (history.liked_post_types?.includes(post.post_type)) {
          score += 5;
          reason += 'Matches your interests in ' + post.post_type;
        }

        // Score based on followed users
        if (history.followed_users?.includes(post.user_id)) {
          score += 10;
          reason = reason ? reason + ', from followed user' : 'From followed user';
        }

        // Score based on engagement
        const engagementScore = (post.likes_count || 0) + (post.comments_count || 0) * 2;
        score += Math.min(engagementScore, 10);

        if (score > 5) { // Only include posts with reasonable scores
          recommendations.push({
            postId: post.id,
            authorId: post.user_id,
            authorUsername: 'Unknown',
            content: post.content,
            createdAt: new Date(post.created_at),
            type: 'recommended',
            personalizedScore: score,
            recommendationReason: reason || 'Based on your activity',
            postType: post.post_type,
            mediaUrl: post.image_url
          });
        }
      }

      // Sort by score and limit results
      recommendations.sort((a, b) => b.personalizedScore - a.personalizedScore);
      const finalRecommendations = recommendations.slice(0, limit);

      logger.info('Personalized recommendations generated', {
        component: 'RecommendationEngine',
        userId,
        recommendationCount: finalRecommendations.length,
        averageScore: finalRecommendations.reduce((sum, rec) => sum + rec.personalizedScore, 0) / finalRecommendations.length
      });

      return finalRecommendations;

    } catch (error) {
      logger.error('Error in generatePersonalizedRecommendations', {
        component: 'RecommendationEngine',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        limit
      });
      throw error;
    }
  }

  /**
   * Notify users about trending content
   */
  public async notifyTrendingContent(trendingContent: TrendingContentItem[]): Promise<void> {
    try {
      if (!trendingContent || trendingContent.length === 0) {
        logger.info('No trending content to notify users about', {
          component: 'RecommendationEngine',
          contentCount: 0
        });
        return;
      }

      const supabaseClient = getSupabaseClient();

      // Get active users (users who have been active recently)
      const activeTimeThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const { data: activeUsers, error } = await supabaseClient
        .from('users')
        .select('id')
        .gte('last_seen_at', activeTimeThreshold.toISOString());

      if (error) {
        throw new Error(error.message);
      }

      const activeUserIds = (activeUsers || []).map(user => user.id);

      // Send trending content notifications
      for (const content of trendingContent) {
        const trendingPayload: TrendingContentPayload = {
          postId: content.postId,
          authorId: content.authorId,
          authorUsername: content.authorUsername,
          content: content.content,
          engagementScore: content.engagementScore,
          type: 'trending',
          trendingRank: content.trendingRank,
          timeWindow: content.timeWindow,
          ...(content.category && { category: content.category })
        };

        await webSocketEventsService.emitTrendingContentUpdate(activeUserIds, trendingPayload);
      }

      logger.info('Trending content notifications sent', {
        component: 'RecommendationEngine',
        userCount: activeUserIds.length,
        contentCount: trendingContent.length
      });

    } catch (error) {
      logger.error('Error in notifyTrendingContent', {
        component: 'RecommendationEngine',
        error: error instanceof Error ? error.message : 'Unknown error',
        contentCount: trendingContent?.length || 0
      });
      throw error;
    }
  }

  /**
   * Process user feedback on recommendations
   */
  public async processRecommendationFeedback(
    userId: string, 
    postId: string, 
    feedback: string
  ): Promise<void> {
    try {
      // Validate feedback type
      const validFeedbackTypes = ['positive', 'negative', 'neutral'];
      if (!validFeedbackTypes.includes(feedback)) {
        throw new Error('Invalid feedback type');
      }

      const supabaseClient = getSupabaseClient();

      // Record feedback in database
      const { error } = await supabaseClient
        .from('recommendation_feedback')
        .insert({
          user_id: userId,
          post_id: postId,
          feedback_type: feedback,
          created_at: new Date().toISOString()
        });

      if (error) {
        throw new Error(error.message);
      }

      logger.info('Recommendation feedback processed', {
        component: 'RecommendationEngine',
        userId,
        postId,
        feedback
      });

    } catch (error) {
      logger.error('Error in processRecommendationFeedback', {
        component: 'RecommendationEngine',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        postId,
        feedback
      });
      throw error;
    }
  }

  /**
   * Update recommendation algorithm based on collective feedback
   */
  public async updateRecommendationAlgorithm(): Promise<void> {
    try {
      const supabaseClient = getSupabaseClient();

      // Analyze feedback patterns from the last 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const { data: feedbackData, error } = await supabaseClient
        .rpc('get_feedback_summary', { 
          start_date: weekAgo.toISOString() 
        });

      if (error) {
        throw new Error(error.message);
      }

      if (!feedbackData || feedbackData.length === 0) {
        logger.info('No feedback data found for algorithm update', {
          component: 'RecommendationEngine'
        });
        return;
      }

      // Calculate weight adjustments based on feedback
      const weightUpdates = feedbackData.map((feedback: any) => {
        const totalFeedback = feedback.positive_count + feedback.negative_count + feedback.neutral_count;
        const positiveRatio = totalFeedback > 0 ? feedback.positive_count / totalFeedback : 0.5;
        
        return {
          post_type: feedback.post_type,
          weight_multiplier: Math.max(0.1, Math.min(2.0, 1 + (positiveRatio - 0.5))),
          updated_at: new Date().toISOString()
        };
      });

      // Update algorithm weights
      const { error: updateError } = await supabaseClient
        .from('recommendation_algorithm_weights')
        .upsert(weightUpdates);

      if (updateError) {
        throw new Error(updateError.message);
      }

      logger.info('Recommendation algorithm updated', {
        component: 'RecommendationEngine',
        weightsUpdated: weightUpdates.length
      });

    } catch (error) {
      logger.error('Error in updateRecommendationAlgorithm', {
        component: 'RecommendationEngine',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}