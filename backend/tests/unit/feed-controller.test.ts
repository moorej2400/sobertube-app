/**
 * Feed Controller Unit Tests
 * Test suite for feed controller business logic
 */

import { Request, Response } from 'express';
import { feedController } from '../../src/controllers/feed';
import { getSupabaseClient } from '../../src/services/supabase';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/services/supabase');
jest.mock('../../src/utils/logger');

const mockSupabaseClient = {
  from: jest.fn(),
  select: jest.fn(),
  eq: jest.fn(),
  lt: jest.fn(),
  gte: jest.fn(),
  order: jest.fn(),
  limit: jest.fn()
};

const mockGetSupabaseClient = getSupabaseClient as jest.MockedFunction<typeof getSupabaseClient>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('Feed Controller Unit Tests', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockGetSupabaseClient.mockReturnValue(mockSupabaseClient as any);

    // Setup mock request and response
    mockRequest = {
      query: {},
      requestId: 'test-request-id'
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();

    // Setup default mock chain
    mockSupabaseClient.from.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.select.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.eq.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.lt.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.gte.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.order.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.limit.mockReturnValue(mockSupabaseClient);
  });

  describe('getFeed', () => {
    it('should handle valid request with default parameters', async () => {
      // Mock successful database responses
      const mockPosts = [
        {
          id: 'post1',
          user_id: 'user1',
          content: 'Test post',
          post_type: 'Recovery Update',
          likes_count: 5,
          comments_count: 3,
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-01T12:00:00Z',
          user: { id: 'user1', username: 'testuser' }
        }
      ];

      const mockVideos = [
        {
          id: 'video1',
          user_id: 'user2',
          title: 'Test video',
          description: 'Test description',
          video_url: '/test.mp4',
          duration: 120,
          likes_count: 10,
          comments_count: 2,
          views_count: 50,
          created_at: '2024-01-01T11:00:00Z',
          updated_at: '2024-01-01T11:00:00Z',
          user: { id: 'user2', username: 'videouser' }
        }
      ];

      // Mock database calls - posts first, then videos
      mockSupabaseClient.from
        .mockReturnValueOnce({
          ...mockSupabaseClient,
          select: jest.fn().mockReturnValue({
            ...mockSupabaseClient,
            order: jest.fn().mockReturnValue({
              ...mockSupabaseClient,
              limit: jest.fn().mockResolvedValue({ data: mockPosts, error: null })
            })
          })
        })
        .mockReturnValueOnce({
          ...mockSupabaseClient,
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              ...mockSupabaseClient,
              order: jest.fn().mockReturnValue({
                ...mockSupabaseClient,
                limit: jest.fn().mockResolvedValue({ data: mockVideos, error: null })
              })
            })
          })
        });

      await feedController.getFeed(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              id: 'post1',
              type: 'post',
              content: 'Test post'
            }),
            expect.objectContaining({
              id: 'video1',
              type: 'video',
              title: 'Test video'
            })
          ])
        })
      );
    });

    it('should handle content_type=posts filter', async () => {
      mockRequest.query = { content_type: 'posts' };

      const mockPosts = [
        {
          id: 'post1',
          user_id: 'user1',
          content: 'Test post',
          post_type: 'Recovery Update',
          likes_count: 5,
          comments_count: 3,
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-01T12:00:00Z',
          user: { id: 'user1', username: 'testuser' }
        }
      ];

      mockSupabaseClient.from.mockReturnValue({
        ...mockSupabaseClient,
        select: jest.fn().mockReturnValue({
          ...mockSupabaseClient,
          order: jest.fn().mockReturnValue({
            ...mockSupabaseClient,
            limit: jest.fn().mockResolvedValue({ data: mockPosts, error: null })
          })
        })
      });

      await feedController.getFeed(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              type: 'post'
            })
          ])
        })
      );

      // Should only call posts table, not videos
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('posts');
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('videos');
    });

    it('should handle content_type=videos filter', async () => {
      mockRequest.query = { content_type: 'videos' };

      const mockVideos = [
        {
          id: 'video1',
          user_id: 'user1',
          title: 'Test video',
          video_url: '/test.mp4',
          duration: 120,
          likes_count: 10,
          comments_count: 2,
          views_count: 50,
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-01T12:00:00Z',
          user: { id: 'user1', username: 'testuser' }
        }
      ];

      mockSupabaseClient.from.mockReturnValue({
        ...mockSupabaseClient,
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            ...mockSupabaseClient,
            order: jest.fn().mockReturnValue({
              ...mockSupabaseClient,
              limit: jest.fn().mockResolvedValue({ data: mockVideos, error: null })
            })
          })
        })
      });

      await feedController.getFeed(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              type: 'video'
            })
          ])
        })
      );

      // Should only call videos table, not posts
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('videos');
      expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('posts');
    });

    it('should validate invalid content_type', async () => {
      mockRequest.query = { content_type: 'invalid' };

      await feedController.getFeed(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'content_type must be one of: all, posts, videos'
      });
    });

    it('should validate invalid post_type', async () => {
      mockRequest.query = { post_type: 'InvalidType' };

      await feedController.getFeed(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'invalid post_type filter'
      });
    });

    it('should validate invalid user_id format', async () => {
      mockRequest.query = { user_id: 'invalid-uuid' };

      await feedController.getFeed(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'invalid user_id format'
      });
    });

    it('should validate invalid limit parameter', async () => {
      mockRequest.query = { limit: 'invalid' };

      await feedController.getFeed(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'limit must be a positive integer'
      });
    });

    it('should validate invalid sort parameter', async () => {
      mockRequest.query = { sort: 'invalid' };

      await feedController.getFeed(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'sort must be one of: chronological, trending'
      });
    });

    it('should handle database error gracefully', async () => {
      mockSupabaseClient.from.mockReturnValue({
        ...mockSupabaseClient,
        select: jest.fn().mockReturnValue({
          ...mockSupabaseClient,
          order: jest.fn().mockReturnValue({
            ...mockSupabaseClient,
            limit: jest.fn().mockResolvedValue({ 
              data: null, 
              error: { message: 'Database connection failed' } 
            })
          })
        })
      });

      await feedController.getFeed(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'failed to fetch feed'
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch posts for feed',
        expect.objectContaining({
          error: 'Database connection failed',
          requestId: 'test-request-id'
        })
      );
    });

    it('should handle cursor pagination', async () => {
      const testCursor = Buffer.from('2024-01-01T12:00:00Z').toString('base64');
      mockRequest.query = { cursor: testCursor };

      mockSupabaseClient.from
        .mockReturnValueOnce({
          ...mockSupabaseClient,
          select: jest.fn().mockReturnValue({
            ...mockSupabaseClient,
            order: jest.fn().mockReturnValue({
              ...mockSupabaseClient,
              limit: jest.fn().mockReturnValue({
                ...mockSupabaseClient,
                lt: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          })
        })
        .mockReturnValueOnce({
          ...mockSupabaseClient,
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              ...mockSupabaseClient,
              order: jest.fn().mockReturnValue({
                ...mockSupabaseClient,
                limit: jest.fn().mockReturnValue({
                  ...mockSupabaseClient,
                  lt: jest.fn().mockResolvedValue({ data: [], error: null })
                })
              })
            })
          })
        });

      await feedController.getFeed(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should handle invalid cursor format', async () => {
      mockRequest.query = { cursor: 'invalid-cursor' };

      await feedController.getFeed(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'invalid cursor format'
      });
    });
  });

  describe('getPersonalizedFeed', () => {
    it('should require authentication', async () => {
      delete mockRequest.user;

      await feedController.getPersonalizedFeed(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'authentication required for personalized feed'
      });
    });

    it('should handle authenticated user', async () => {
      mockRequest.user = { id: 'user1', email: 'test@example.com', emailConfirmed: true };

      // Mock the general feed call
      mockSupabaseClient.from
        .mockReturnValueOnce({
          ...mockSupabaseClient,
          select: jest.fn().mockReturnValue({
            ...mockSupabaseClient,
            order: jest.fn().mockReturnValue({
              ...mockSupabaseClient,
              limit: jest.fn().mockResolvedValue({ data: [], error: null })
            })
          })
        })
        .mockReturnValueOnce({
          ...mockSupabaseClient,
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              ...mockSupabaseClient,
              order: jest.fn().mockReturnValue({
                ...mockSupabaseClient,
                limit: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          })
        });

      await feedController.getPersonalizedFeed(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Personalized feed requested (falling back to general feed)',
        expect.objectContaining({
          userId: 'user1',
          requestId: 'test-request-id'
        })
      );
    });
  });

  describe('getFeedStats', () => {
    it('should return feed statistics', async () => {
      // Mock count queries
      mockSupabaseClient.from
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({ count: 10, error: null })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ count: 5, error: null })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue({ count: 3, error: null })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            gte: jest.fn().mockResolvedValue({ count: 2, error: null })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockResolvedValue({ count: 1, error: null })
            })
          })
        });

      await feedController.getFeedStats(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        statistics: {
          total_content: 15,
          total_posts: 10,
          total_videos: 5,
          total_users: 3,
          recent_activity: {
            posts_24h: 2,
            videos_24h: 1,
            total_24h: 3
          }
        },
        timestamp: expect.any(String)
      });
    });

    it('should handle database error in statistics', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockResolvedValue({ 
          count: null, 
          error: { message: 'Stats query failed' } 
        })
      });

      await feedController.getFeedStats(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'failed to fetch feed statistics'
      });
    });
  });
});