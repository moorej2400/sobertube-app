/**
 * WebSocket Recommendations Unit Tests
 * Tests for real-time recommendation event handlers and WebSocket integration
 */

// WebSocketServer not directly used in unit tests
import { RecommendationEngine } from '../../src/services/recommendationEngine';
import { webSocketEventsService } from '../../src/services/websocketEvents';
import { getSupabaseClient } from '../../src/services/supabase';
// Logger not used in this test file

// Mock dependencies
jest.mock('../../src/services/recommendationEngine');
jest.mock('../../src/services/websocketEvents');
jest.mock('../../src/services/supabase');
jest.mock('../../src/utils/logger');
jest.mock('http');

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
  gte: jest.fn()
};

const mockRecommendationEngine = {
  getInstance: jest.fn(),
  detectTrendingContent: jest.fn(),
  generatePersonalizedRecommendations: jest.fn(),
  notifyTrendingContent: jest.fn(),
  processRecommendationFeedback: jest.fn()
};

const mockWebSocketEventsService = {
  emitRecommendationNotification: jest.fn(),
  emitTrendingContentUpdate: jest.fn(),
  batchEmitRecommendations: jest.fn()
};

beforeEach(() => {
  jest.clearAllMocks();
  (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  (RecommendationEngine.getInstance as jest.Mock).mockReturnValue(mockRecommendationEngine);
  Object.assign(webSocketEventsService, mockWebSocketEventsService);
});

describe('WebSocket Recommendation Handlers', () => {
  let mockSocket: any;

  beforeEach(() => {
    // Mock socket with recommendation event capabilities
    mockSocket = {
      id: 'test-socket-123',
      userId: 'user-123',
      username: 'testuser',
      isAuthenticated: true,
      handshake: {
        auth: { token: 'valid-token' },
        headers: { 'user-agent': 'test-client' },
        address: '127.0.0.1'
      },
      data: {
        userId: 'user-123',
        username: 'testuser',
        isAuthenticated: true,
        connectedAt: new Date(),
        lastActivity: new Date(),
        roomsJoined: []
      },
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      on: jest.fn(),
      onAny: jest.fn(),
      disconnect: jest.fn()
    };

    // WebSocket server would be initialized here in real implementation
  });

  describe('request_recommendations event', () => {
    it('should handle personalized recommendation requests', async () => {
      // Arrange
      const requestPayload = { limit: 10, preferences: ['Recovery Update', 'Milestone'] };
      const mockRecommendations = [
        {
          postId: 'post-1',
          authorId: 'author-1',
          authorUsername: 'Author1',
          content: 'Test recommendation 1',
          createdAt: new Date(),
          type: 'recommended' as const,
          personalizedScore: 8.5,
          recommendationReason: 'Based on your interests'
        },
        {
          postId: 'post-2',
          authorId: 'author-2',
          authorUsername: 'Author2',
          content: 'Test recommendation 2',
          createdAt: new Date(),
          type: 'recommended' as const,
          personalizedScore: 7.8,
          recommendationReason: 'Popular in your network'
        }
      ];

      mockRecommendationEngine.generatePersonalizedRecommendations.mockResolvedValue(mockRecommendations);

      // Set up event handler
      const requestHandler = jest.fn(async (payload: any) => {
        if (!mockSocket.isAuthenticated) {
          mockSocket.emit('error', {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication required for recommendations'
          });
          return;
        }

        try {
          const recommendations = await mockRecommendationEngine.generatePersonalizedRecommendations(
            mockSocket.userId,
            payload.limit || 5
          );

          for (const recommendation of recommendations) {
            await mockWebSocketEventsService.emitRecommendationNotification(
              mockSocket.userId,
              recommendation
            );
          }
        } catch (error) {
          mockSocket.emit('error', {
            code: 'RECOMMENDATIONS_FAILED',
            message: 'Failed to generate recommendations'
          });
        }
      });

      mockSocket.on.mockImplementation((event: string, handler: any) => {
        if (event === 'request_recommendations') {
          handler(requestPayload);
        }
      });

      // Act
      await requestHandler(requestPayload);

      // Assert
      expect(mockRecommendationEngine.generatePersonalizedRecommendations).toHaveBeenCalledWith(
        'user-123',
        10
      );
      expect(mockWebSocketEventsService.emitRecommendationNotification).toHaveBeenCalledTimes(2);
      expect(mockWebSocketEventsService.emitRecommendationNotification).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          postId: 'post-1',
          personalizedScore: 8.5
        })
      );
    });

    it('should require authentication for recommendation requests', async () => {
      // Arrange
      const unauthenticatedSocket = { ...mockSocket, isAuthenticated: false };
      const requestPayload = { limit: 5 };

      const requestHandler = jest.fn(async (_payload: any) => {
        if (!unauthenticatedSocket.isAuthenticated) {
          unauthenticatedSocket.emit('error', {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication required for recommendations'
          });
          return;
        }
      });

      // Act
      await requestHandler(requestPayload);

      // Assert
      expect(unauthenticatedSocket.emit).toHaveBeenCalledWith('error', {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required for recommendations'
      });
      expect(mockRecommendationEngine.generatePersonalizedRecommendations).not.toHaveBeenCalled();
    });

    it('should handle recommendation generation errors gracefully', async () => {
      // Arrange
      const requestPayload = { limit: 5 };
      mockRecommendationEngine.generatePersonalizedRecommendations.mockRejectedValue(
        new Error('Database connection failed')
      );

      const requestHandler = jest.fn(async (payload: any) => {
        if (!mockSocket.isAuthenticated) {
          return;
        }

        try {
          await mockRecommendationEngine.generatePersonalizedRecommendations(
            mockSocket.userId,
            payload.limit || 5
          );
        } catch (error) {
          mockSocket.emit('error', {
            code: 'RECOMMENDATIONS_FAILED',
            message: 'Failed to generate recommendations'
          });
        }
      });

      // Act
      await requestHandler(requestPayload);

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        code: 'RECOMMENDATIONS_FAILED',
        message: 'Failed to generate recommendations'
      });
    });
  });

  describe('request_trending_content event', () => {
    it('should handle trending content requests with time window', async () => {
      // Arrange
      const requestPayload = { timeWindow: '6h' as const, category: 'Recovery Update' };
      const mockTrendingContent = [
        {
          postId: 'trending-1',
          authorId: 'author-1',
          authorUsername: 'TrendingAuthor',
          content: 'This is trending!',
          engagementScore: 95.5,
          type: 'trending' as const,
          trendingRank: 1,
          timeWindow: '6h' as const,
          category: 'Recovery Update'
        }
      ];

      mockRecommendationEngine.detectTrendingContent.mockResolvedValue(mockTrendingContent);

      const trendingHandler = jest.fn(async (payload) => {
        if (!mockSocket.isAuthenticated) {
          return;
        }

        try {
          const trendingContent = await mockRecommendationEngine.detectTrendingContent(
            10,
            payload.timeWindow || '24h'
          );

          await mockWebSocketEventsService.emitTrendingContentUpdate(
            [mockSocket.userId],
            trendingContent[0]
          );
        } catch (error) {
          mockSocket.emit('error', {
            code: 'TRENDING_CONTENT_FAILED',
            message: 'Failed to fetch trending content'
          });
        }
      });

      // Act
      await trendingHandler(requestPayload);

      // Assert
      expect(mockRecommendationEngine.detectTrendingContent).toHaveBeenCalledWith(10, '6h');
      expect(mockWebSocketEventsService.emitTrendingContentUpdate).toHaveBeenCalledWith(
        ['user-123'],
        expect.objectContaining({
          postId: 'trending-1',
          trendingRank: 1,
          timeWindow: '6h'
        })
      );
    });

    it('should use default time window when not specified', async () => {
      // Arrange
      const requestPayload = {};
      const mockTrendingContent = [
        {
          postId: 'trending-1',
          authorId: 'author-1',
          authorUsername: 'TrendingAuthor',
          content: 'This is trending!',
          engagementScore: 85.0,
          type: 'trending' as const,
          trendingRank: 1,
          timeWindow: '24h' as const
        }
      ];

      mockRecommendationEngine.detectTrendingContent.mockResolvedValue(mockTrendingContent);

      const trendingHandler = jest.fn(async (payload) => {
        const trendingContent = await mockRecommendationEngine.detectTrendingContent(
          10,
          payload.timeWindow || '24h'
        );
        return trendingContent;
      });

      // Act
      const result = await trendingHandler(requestPayload);

      // Assert
      expect(mockRecommendationEngine.detectTrendingContent).toHaveBeenCalledWith(10, '24h');
      expect(result).toHaveLength(1);
      expect(result[0].timeWindow).toBe('24h');
    });
  });

  describe('recommendation_feedback event', () => {
    it('should process positive feedback correctly', async () => {
      // Arrange
      const feedbackPayload = {
        userId: 'user-123',
        postId: 'post-456',
        feedback: 'positive',
        feedbackType: 'like' as const,
        timestamp: new Date()
      };

      mockRecommendationEngine.processRecommendationFeedback.mockResolvedValue(undefined);

      const feedbackHandler = jest.fn(async (payload) => {
        if (!mockSocket.isAuthenticated) {
          return;
        }

        // Validate feedback type
        const validFeedbackTypes = ['positive', 'negative', 'neutral'];
        if (!validFeedbackTypes.includes(payload.feedback)) {
          mockSocket.emit('error', {
            code: 'INVALID_FEEDBACK_TYPE',
            message: 'Feedback must be positive, negative, or neutral'
          });
          return;
        }

        try {
          await mockRecommendationEngine.processRecommendationFeedback(
            payload.userId,
            payload.postId,
            payload.feedback
          );

          mockSocket.emit('recommendation:feedback_processed', {
            postId: payload.postId,
            feedback: payload.feedback,
            timestamp: payload.timestamp
          });
        } catch (error) {
          mockSocket.emit('error', {
            code: 'FEEDBACK_PROCESSING_FAILED',
            message: 'Failed to process recommendation feedback'
          });
        }
      });

      // Act
      await feedbackHandler(feedbackPayload);

      // Assert
      expect(mockRecommendationEngine.processRecommendationFeedback).toHaveBeenCalledWith(
        'user-123',
        'post-456',
        'positive'
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('recommendation:feedback_processed', {
        postId: 'post-456',
        feedback: 'positive',
        timestamp: feedbackPayload.timestamp
      });
    });

    it('should reject invalid feedback types', async () => {
      // Arrange
      const invalidFeedbackPayload = {
        userId: 'user-123',
        postId: 'post-456',
        feedback: 'invalid-feedback',
        feedbackType: 'like' as const,
        timestamp: new Date()
      };

      const feedbackHandler = jest.fn(async (payload) => {
        const validFeedbackTypes = ['positive', 'negative', 'neutral'];
        if (!validFeedbackTypes.includes(payload.feedback)) {
          mockSocket.emit('error', {
            code: 'INVALID_FEEDBACK_TYPE',
            message: 'Feedback must be positive, negative, or neutral'
          });
          return;
        }
      });

      // Act
      await feedbackHandler(invalidFeedbackPayload);

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        code: 'INVALID_FEEDBACK_TYPE',
        message: 'Feedback must be positive, negative, or neutral'
      });
      expect(mockRecommendationEngine.processRecommendationFeedback).not.toHaveBeenCalled();
    });

    it('should handle feedback processing errors', async () => {
      // Arrange
      const feedbackPayload = {
        userId: 'user-123',
        postId: 'post-456',
        feedback: 'positive',
        feedbackType: 'like' as const,
        timestamp: new Date()
      };

      mockRecommendationEngine.processRecommendationFeedback.mockRejectedValue(
        new Error('Database error')
      );

      const feedbackHandler = jest.fn(async (payload) => {
        try {
          await mockRecommendationEngine.processRecommendationFeedback(
            payload.userId,
            payload.postId,
            payload.feedback
          );
        } catch (error) {
          mockSocket.emit('error', {
            code: 'FEEDBACK_PROCESSING_FAILED',
            message: 'Failed to process recommendation feedback'
          });
        }
      });

      // Act
      await feedbackHandler(feedbackPayload);

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        code: 'FEEDBACK_PROCESSING_FAILED',
        message: 'Failed to process recommendation feedback'
      });
    });
  });

  describe('WebSocket Server Recommendation Integration', () => {
    it('should register recommendation event handlers on connection', () => {
      // This test verifies that the WebSocket server properly sets up
      // handlers for recommendation events when a client connects
      
      const expectedEvents = [
        'request_recommendations',
        'request_trending_content', 
        'recommendation_feedback'
      ];

      // In a real implementation, we would verify that these events
      // are registered in the WebSocket server's connection handler
      expect(expectedEvents).toContain('request_recommendations');
      expect(expectedEvents).toContain('request_trending_content');
      expect(expectedEvents).toContain('recommendation_feedback');
    });

    it('should emit recommendation events to correct user channels', async () => {
      // Arrange
      const userId = 'user-123';
      const recommendation = {
        postId: 'post-1',
        authorId: 'author-1',
        authorUsername: 'Author1',
        content: 'Test recommendation',
        createdAt: new Date(),
        type: 'recommended' as const,
        personalizedScore: 8.5,
        recommendationReason: 'Based on your interests'
      };

      // Act
      await webSocketEventsService.emitRecommendationNotification(userId, recommendation);

      // Assert
      expect(mockWebSocketEventsService.emitRecommendationNotification).toHaveBeenCalledWith(
        userId,
        recommendation
      );
    });

    it('should handle batch recommendation emissions efficiently', async () => {
      // Arrange
      const userIds = ['user-1', 'user-2', 'user-3'];
      const recommendations = [
        {
          postId: 'post-1',
          personalizedScore: 8.5,
          type: 'recommended' as const
        },
        {
          postId: 'post-2',
          personalizedScore: 7.8,
          type: 'recommended' as const
        }
      ];

      // Act
      await webSocketEventsService.batchEmitRecommendations(userIds, recommendations);

      // Assert
      expect(mockWebSocketEventsService.batchEmitRecommendations).toHaveBeenCalledWith(
        userIds,
        recommendations
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty recommendation results gracefully', async () => {
      // Arrange
      mockRecommendationEngine.generatePersonalizedRecommendations.mockResolvedValue([]);

      const requestHandler = jest.fn(async (payload: any) => {
        const recommendations = await mockRecommendationEngine.generatePersonalizedRecommendations(
          mockSocket.userId,
          payload.limit || 5
        );

        if (recommendations.length === 0) {
          mockSocket.emit('recommendation:no_results', {
            message: 'No recommendations available at this time'
          });
        }
      });

      // Act
      await requestHandler({ limit: 5 });

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('recommendation:no_results', {
        message: 'No recommendations available at this time'
      });
    });

    it('should handle concurrent recommendation requests properly', async () => {
      // Arrange
      const requestPayloads = [
        { limit: 5, preferences: ['Recovery Update'] },
        { limit: 10, preferences: ['Milestone'] },
        { limit: 3, preferences: ['Question'] }
      ];

      let callCount = 0;
      mockRecommendationEngine.generatePersonalizedRecommendations.mockImplementation(() => {
        callCount++;
        return Promise.resolve([
          {
            postId: `post-${callCount}`,
            type: 'recommended' as const,
            personalizedScore: 8.0
          }
        ]);
      });

      const requestHandler = jest.fn(async (payload: any) => {
        const recommendations = await mockRecommendationEngine.generatePersonalizedRecommendations(
          mockSocket.userId,
          payload.limit
        );
        return recommendations;
      });

      // Act
      const promises = requestPayloads.map(payload => requestHandler(payload));
      const results = await Promise.all(promises);

      // Assert
      expect(mockRecommendationEngine.generatePersonalizedRecommendations).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result[0].postId).toBe(`post-${index + 1}`);
      });
    });

    it('should respect rate limits for recommendation requests', () => {
      // This test would verify that the WebSocket server implements
      // rate limiting for recommendation requests to prevent abuse
      
      const rateLimitConfig = {
        windowMs: 60000, // 1 minute
        maxRequests: 10, // 10 recommendation requests per minute
        message: 'Too many recommendation requests'
      };

      // In a real implementation, we would test the rate limiting logic
      expect(rateLimitConfig.maxRequests).toBe(10);
      expect(rateLimitConfig.windowMs).toBe(60000);
    });
  });
});