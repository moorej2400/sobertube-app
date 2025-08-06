/**
 * Recommendation Engine Unit Tests
 * Tests for real-time content recommendation functionality
 */

import { RecommendationEngine } from '../../src/services/recommendationEngine';
import { webSocketEventsService } from '../../src/services/websocketEvents';
import { getSupabaseClient } from '../../src/services/supabase';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/services/websocketEvents');
jest.mock('../../src/services/supabase');
jest.mock('../../src/utils/logger');

const mockSupabaseClient = {
  from: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  eq: jest.fn(),
  in: jest.fn(),
  order: jest.fn(),
  limit: jest.fn(),
  single: jest.fn(),
  rpc: jest.fn(),
  gte: jest.fn(),
  lt: jest.fn()
};

const mockWebSocketEventsService = {
  emitRecommendationNotification: jest.fn(),
  emitTrendingContentUpdate: jest.fn(),
  batchEmitRecommendations: jest.fn()
};

beforeEach(() => {
  jest.clearAllMocks();
  (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  Object.assign(webSocketEventsService, mockWebSocketEventsService);
});

describe('RecommendationEngine', () => {
  let recommendationEngine: RecommendationEngine;
  
  beforeEach(() => {
    recommendationEngine = RecommendationEngine.getInstance();
  });

  describe('detectTrendingContent', () => {
    it('should identify trending posts based on engagement metrics', async () => {
      // Arrange
      const mockTrendingPosts = [
        {
          id: 'post-1',
          user_id: 'author-1',
          content: 'Trending post 1',
          post_type: 'Recovery Update',
          created_at: new Date().toISOString(),
          likes_count: 50,
          comments_count: 20,
          views_count: 200,
          engagement_score: 85.5
        },
        {
          id: 'post-2',
          user_id: 'author-2',
          content: 'Trending post 2',
          post_type: 'Milestone',
          created_at: new Date().toISOString(),
          likes_count: 30,
          comments_count: 15,
          views_count: 150,
          engagement_score: 70.2
        }
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue({ data: mockTrendingPosts, error: null })
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      // Act
      const trendingContent = await recommendationEngine.detectTrendingContent();

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('posts');
      expect(mockQuery.select).toHaveBeenCalledWith(expect.stringContaining('engagement_score'));
      expect(mockQuery.gte).toHaveBeenCalledWith(
        'created_at', 
        expect.any(String) // Should be within last 24 hours
      );
      expect(mockQuery.order).toHaveBeenCalledWith('engagement_score', { ascending: false });
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      
      expect(trendingContent).toHaveLength(2);
      expect(trendingContent[0]).toEqual(expect.objectContaining({
        postId: 'post-1',
        engagementScore: 85.5,
        type: 'trending'
      }));
    });

    it('should handle case with no trending content', async () => {
      // Arrange
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue({ data: [], error: null })
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      // Act
      const trendingContent = await recommendationEngine.detectTrendingContent();

      // Assert
      expect(trendingContent).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith(
        'No trending content found',
        expect.objectContaining({
          component: 'RecommendationEngine'
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue({ data: null, error: { message: 'Database error' } })
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      // Act & Assert
      await expect(recommendationEngine.detectTrendingContent()).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to detect trending content',
        expect.objectContaining({
          error: 'Database error'
        })
      );
    });
  });

  describe('generatePersonalizedRecommendations', () => {
    it('should generate personalized recommendations based on user history', async () => {
      // Arrange
      const userId = 'user-123';
      const mockUserHistory = {
        liked_post_types: ['Recovery Update', 'Milestone'],
        followed_users: ['author-1', 'author-2'],
        interaction_patterns: {
          preferred_time: 'morning',
          engagement_rate: 0.75
        }
      };

      const mockRecommendedPosts = [
        {
          id: 'post-1',
          user_id: 'author-1',
          content: 'Recommended post',
          post_type: 'Recovery Update',
          created_at: new Date().toISOString(),
          likes_count: 10,
          comments_count: 5
        }
      ];

      // Mock user history query
      const mockHistoryQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnValue({ data: [mockUserHistory], error: null })
      };

      // Mock recommended posts query
      const mockPostsQuery = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue({ data: mockRecommendedPosts, error: null })
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'user_interaction_history') return mockHistoryQuery;
        if (table === 'posts') return mockPostsQuery;
        return mockSupabaseClient;
      });

      // Act
      const recommendations = await recommendationEngine.generatePersonalizedRecommendations(userId, 5);

      // Assert
      expect(recommendations).toHaveLength(1);
      expect(recommendations[0]).toEqual(expect.objectContaining({
        postId: 'post-1',
        authorId: 'author-1',
        type: 'recommended',
        personalizedScore: expect.any(Number)
      }));
    });

    it('should fall back to trending content when user has no history', async () => {
      // Arrange
      const userId = 'user-new';
      
      const mockHistoryQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnValue({ data: [], error: null })
      };

      const mockTrendingPosts = [
        {
          id: 'trending-1',
          user_id: 'popular-author',
          content: 'Popular content',
          post_type: 'Recovery Update',
          created_at: new Date().toISOString(),
          engagement_score: 80.0
        }
      ];

      const mockTrendingQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue({ data: mockTrendingPosts, error: null })
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'user_interaction_history') return mockHistoryQuery;
        if (table === 'posts') return mockTrendingQuery;
        return mockSupabaseClient;
      });

      // Act
      const recommendations = await recommendationEngine.generatePersonalizedRecommendations(userId, 5);

      // Assert
      expect(recommendations).toHaveLength(1);
      expect(recommendations[0]).toEqual(expect.objectContaining({
        postId: 'trending-1',
        type: 'recommended',
        fallbackToTrending: true
      }));
    });
  });

  describe('notifyTrendingContent', () => {
    it('should notify all users about trending content', async () => {
      // Arrange
      const mockActiveUsers = ['user-1', 'user-2', 'user-3'];
      const mockTrendingContent = [
        {
          postId: 'trending-1',
          authorId: 'author-1',
          authorUsername: 'TrendyAuthor',
          content: 'This is trending!',
          engagementScore: 95.5,
          type: 'trending' as const,
          trendingRank: 1,
          timeWindow: '24h' as const,
          category: 'Recovery Update'
        }
      ];

      const mockUsersQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnValue({ data: mockActiveUsers.map(id => ({ id })), error: null })
      };
      mockSupabaseClient.from.mockReturnValue(mockUsersQuery);

      // Act
      await recommendationEngine.notifyTrendingContent(mockTrendingContent);

      // Assert
      expect(mockWebSocketEventsService.emitTrendingContentUpdate).toHaveBeenCalledWith(
        mockActiveUsers,
        mockTrendingContent[0]
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Trending content notifications sent',
        expect.objectContaining({
          userCount: mockActiveUsers.length,
          contentCount: mockTrendingContent.length
        })
      );
    });

    it('should handle empty trending content gracefully', async () => {
      // Arrange
      const emptyTrendingContent: any[] = [];

      // Act
      await recommendationEngine.notifyTrendingContent(emptyTrendingContent);

      // Assert
      expect(mockWebSocketEventsService.emitTrendingContentUpdate).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'No trending content to notify users about',
        expect.objectContaining({
          contentCount: 0
        })
      );
    });
  });

  describe('processRecommendationFeedback', () => {
    it('should record user feedback and update recommendation scores', async () => {
      // Arrange
      const userId = 'user-123';
      const postId = 'post-456';
      const feedback = 'positive';

      const mockFeedbackInsert = {
        insert: jest.fn().mockReturnValue({ data: { id: 'feedback-1' }, error: null })
      };
      mockSupabaseClient.from.mockReturnValue(mockFeedbackInsert);

      // Act
      await recommendationEngine.processRecommendationFeedback(userId, postId, feedback);

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('recommendation_feedback');
      expect(mockFeedbackInsert.insert).toHaveBeenCalledWith({
        user_id: userId,
        post_id: postId,
        feedback_type: feedback,
        created_at: expect.any(String)
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Recommendation feedback processed',
        expect.objectContaining({
          userId,
          postId,
          feedback
        })
      );
    });

    it('should handle invalid feedback types', async () => {
      // Arrange
      const userId = 'user-123';
      const postId = 'post-456';
      const invalidFeedback = 'invalid-type';

      // Act & Assert
      await expect(
        recommendationEngine.processRecommendationFeedback(userId, postId, invalidFeedback)
      ).rejects.toThrow('Invalid feedback type');
    });
  });

  describe('updateRecommendationAlgorithm', () => {
    it('should update algorithm based on collective feedback patterns', async () => {
      // Arrange
      const mockFeedbackData = [
        { post_type: 'Recovery Update', positive_count: 45, negative_count: 5, neutral_count: 10 },
        { post_type: 'Milestone', positive_count: 30, negative_count: 10, neutral_count: 5 },
        { post_type: 'Question', positive_count: 15, negative_count: 25, neutral_count: 10 }
      ];

      // Mock the rpc call for feedback summary
      mockSupabaseClient.rpc.mockResolvedValue({ data: mockFeedbackData, error: null });

      const mockAlgorithmUpdate = {
        upsert: jest.fn().mockReturnValue({ data: { success: true }, error: null })
      };
      // Mock the upsert for algorithm weights
      mockSupabaseClient.from.mockReturnValue(mockAlgorithmUpdate);

      // Act
      await recommendationEngine.updateRecommendationAlgorithm();

      // Assert
      expect(mockAlgorithmUpdate.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            post_type: 'Recovery Update',
            weight_multiplier: expect.any(Number)
          })
        ])
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Recommendation algorithm updated',
        expect.objectContaining({
          component: 'RecommendationEngine'
        })
      );
    });
  });
});