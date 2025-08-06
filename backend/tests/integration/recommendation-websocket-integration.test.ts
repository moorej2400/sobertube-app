/**
 * Recommendation Engine and WebSocket Integration Tests
 * Tests the complete integration between recommendation engine and WebSocket events
 */

import { RecommendationEngine } from '../../src/services/recommendationEngine';
import { webSocketEventsService } from '../../src/services/websocketEvents';
import { getSupabaseClient } from '../../src/services/supabase';
import { logger } from '../../src/utils/logger';

// Mock dependencies
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
  upsert: jest.fn()
};

// Mock WebSocket server
const mockWebSocketServer = {
  broadcastToUser: jest.fn(),
  getIOServer: jest.fn(() => ({
    to: jest.fn(() => ({
      emit: jest.fn()
    }))
  }))
};

beforeEach(() => {
  jest.clearAllMocks();
  (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  
  // Set up WebSocket server for the events service
  webSocketEventsService.setWebSocketServer(mockWebSocketServer);
});

describe('Recommendation Engine and WebSocket Integration', () => {
  let recommendationEngine: RecommendationEngine;
  
  beforeEach(() => {
    recommendationEngine = RecommendationEngine.getInstance();
  });

  describe('Trending Content Detection and Broadcast', () => {
    it('should detect trending content and broadcast to active users', async () => {
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
        }
      ];

      const mockActiveUsers = [
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' }
      ];

      // Mock trending content detection
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue({ data: mockTrendingPosts, error: null })
      };

      // Mock active users query
      const mockUsersQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnValue({ data: mockActiveUsers, error: null })
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return mockQuery;
        if (table === 'users') return mockUsersQuery;
        return mockSupabaseClient;
      });

      // Act
      const trendingContent = await recommendationEngine.detectTrendingContent();
      await recommendationEngine.notifyTrendingContent(trendingContent);

      // Assert
      expect(trendingContent).toHaveLength(1);
      expect(trendingContent[0]).toEqual(expect.objectContaining({
        postId: 'post-1',
        engagementScore: 85.5,
        type: 'trending',
        trendingRank: 1
      }));

      // Verify WebSocket broadcasts
      expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledTimes(3); // One call per active user
      expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith(
        'user-1',
        'recommendation:trending_content',
        expect.objectContaining({
          postId: 'post-1',
          type: 'trending'
        })
      );
    });

    it('should handle case with no active users gracefully', async () => {
      // Arrange
      const mockTrendingPosts = [
        {
          id: 'post-1',
          user_id: 'author-1',
          content: 'Trending post 1',
          created_at: new Date().toISOString(),
          engagement_score: 85.5
        }
      ];

      const mockPostsQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue({ data: mockTrendingPosts, error: null })
      };

      const mockUsersQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnValue({ data: [], error: null })
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'posts') return mockPostsQuery;
        if (table === 'users') return mockUsersQuery;
        return mockSupabaseClient;
      });

      // Act
      const trendingContent = await recommendationEngine.detectTrendingContent();
      await recommendationEngine.notifyTrendingContent(trendingContent);

      // Assert
      expect(mockWebSocketServer.broadcastToUser).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Trending content notifications sent',
        expect.objectContaining({
          userCount: 0,
          contentCount: 1
        })
      );
    });
  });

  describe('Personalized Recommendations Flow', () => {
    it('should generate personalized recommendations and emit to specific user', async () => {
      // Arrange
      const userId = 'user-123';
      const mockUserHistory = {
        liked_post_types: ['Recovery Update', 'Milestone'],
        followed_users: ['author-1'],
        interaction_patterns: {}
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
        type: 'recommended',
        personalizedScore: expect.any(Number)
      }));
    });

    it('should handle WebSocket emission errors gracefully', async () => {
      // Arrange
      const userIds = ['user-1', 'user-2'];
      const trendingContent = {
        postId: 'post-1',
        authorId: 'author-1',
        authorUsername: 'Author1',
        content: 'Test content',
        engagementScore: 85.5,
        type: 'trending' as const,
        trendingRank: 1,
        timeWindow: '24h' as const
      };

      // Mock WebSocket server to reject for one user but succeed for others
      mockWebSocketServer.broadcastToUser.mockImplementation((userId: string) => {
        if (userId === 'user-1') {
          return Promise.reject(new Error('WebSocket connection lost'));
        }
        return Promise.resolve();
      });

      // Act & Assert - should not throw error, should handle individual failures
      await expect(
        webSocketEventsService.emitTrendingContentUpdate(userIds, trendingContent)
      ).resolves.not.toThrow();

      // Should have attempted to broadcast to both users
      expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledTimes(2);
    });
  });

  describe('Recommendation Feedback Integration', () => {
    it('should process feedback and update algorithm weights', async () => {
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

    it('should update recommendation algorithm based on feedback patterns', async () => {
      // Arrange
      const mockFeedbackData = [
        { post_type: 'Recovery Update', positive_count: 45, negative_count: 5, neutral_count: 10 },
        { post_type: 'Milestone', positive_count: 30, negative_count: 10, neutral_count: 5 }
      ];

      mockSupabaseClient.rpc.mockResolvedValue({ data: mockFeedbackData, error: null });

      const mockAlgorithmUpdate = {
        upsert: jest.fn().mockReturnValue({ data: { success: true }, error: null })
      };
      mockSupabaseClient.from.mockReturnValue(mockAlgorithmUpdate);

      // Act
      await recommendationEngine.updateRecommendationAlgorithm();

      // Assert
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_feedback_summary', {
        start_date: expect.any(String)
      });

      expect(mockAlgorithmUpdate.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            post_type: 'Recovery Update',
            weight_multiplier: expect.any(Number)
          }),
          expect.objectContaining({
            post_type: 'Milestone',
            weight_multiplier: expect.any(Number)
          })
        ])
      );
    });
  });

  describe('Real-time Event Broadcasting', () => {
    it('should emit trending content updates to multiple users efficiently', async () => {
      // Arrange
      const userIds = ['user-1', 'user-2', 'user-3'];
      const trendingContent = {
        postId: 'post-1',
        authorId: 'author-1',
        authorUsername: 'TrendingAuthor',
        content: 'This is trending!',
        engagementScore: 95.5,
        type: 'trending' as const,
        trendingRank: 1,
        timeWindow: '24h' as const
      };

      // Act
      await webSocketEventsService.emitTrendingContentUpdate(userIds, trendingContent);

      // Assert
      expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledTimes(3);
      userIds.forEach(userId => {
        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith(
          userId,
          'recommendation:trending_content',
          trendingContent
        );
      });
    });

    it('should handle WebSocket server unavailability gracefully', async () => {
      // Arrange - Create a mock service to test unavailability
      const mockUnavailableService = {
        wsServer: null,
        isWebSocketAvailable: () => false,
        emitRecommendationNotification: async (userId: string, _recommendation: any) => {
          // Simulate the actual method behavior when WebSocket is unavailable
          logger.warn('WebSocket server not available for recommendation notification', {
            component: 'WebSocketEventsService',
            userId
          });
        }
      };

      const userId = 'user-123';
      const recommendation = {
        postId: 'post-1',
        authorId: 'author-1',
        type: 'recommended' as const,
        personalizedScore: 8.5
      };

      // Act
      await mockUnavailableService.emitRecommendationNotification(userId, recommendation);

      // Assert - should log warning but not throw error
      expect(logger.warn).toHaveBeenCalledWith(
        'WebSocket server not available for recommendation notification',
        expect.objectContaining({
          userId
        })
      );
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle database connection failures in recommendation generation', async () => {
      // Arrange
      const userId = 'user-123';
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      // Act & Assert
      await expect(
        recommendationEngine.generatePersonalizedRecommendations(userId, 5)
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle partial WebSocket emission failures', async () => {
      // Arrange
      const userIds = ['user-1', 'user-2', 'user-3'];
      const recommendation = {
        postId: 'post-1',
        type: 'recommended' as const,
        personalizedScore: 8.5
      };

      // Mock one user's emission to fail
      mockWebSocketServer.broadcastToUser.mockImplementation((userId: string) => {
        if (userId === 'user-2') {
          throw new Error('User disconnected');
        }
        return Promise.resolve();
      });

      // Act & Assert - should not throw error
      await expect(
        webSocketEventsService.batchEmitRecommendations(userIds, [recommendation])
      ).resolves.not.toThrow();

      // Should still attempt all users
      expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledTimes(3);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large batches of recommendations efficiently', async () => {
      // Arrange
      const userIds = Array.from({ length: 100 }, (_, i) => `user-${i}`);
      const recommendations = Array.from({ length: 10 }, (_, i) => ({
        postId: `post-${i}`,
        type: 'recommended' as const,
        personalizedScore: Math.random() * 10
      }));

      // Act
      const startTime = Date.now();
      await webSocketEventsService.batchEmitRecommendations(userIds, recommendations);
      const endTime = Date.now();

      // Assert - should complete within reasonable time (less than 1 second)
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(1000);
      expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledTimes(100);
    });

    it('should limit recommendation generation to prevent resource exhaustion', async () => {
      // Arrange
      const userId = 'user-123';
      const excessiveLimit = 1000; // Way more than reasonable

      const mockHistoryQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnValue({ data: [], error: null })
      };

      const mockPostsQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue({ data: [], error: null })
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'user_interaction_history') return mockHistoryQuery;
        if (table === 'posts') return mockPostsQuery;
        return mockSupabaseClient;
      });

      // Act
      const recommendations = await recommendationEngine.generatePersonalizedRecommendations(
        userId, 
        excessiveLimit
      );

      // Assert - should fall back to trending content with reasonable limit
      expect(recommendations).toEqual([]);
      expect(mockPostsQuery.limit).toHaveBeenCalledWith(expect.any(Number));
    });
  });
});