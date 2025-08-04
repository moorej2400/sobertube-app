/**
 * Likes Controller Unit Tests
 */

import { Request, Response } from 'express';
import { likesController } from '../../src/controllers/likes';
import { getSupabaseClient } from '../../src/services/supabase';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/services/supabase');
jest.mock('../../src/utils/logger');

const mockSupabaseClient = {
  rpc: jest.fn(),
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn()
          }))
        }))
      }))
    }))
  }))
};

const mockGetSupabaseClient = getSupabaseClient as jest.MockedFunction<typeof getSupabaseClient>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('Likes Controller', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSupabaseClient.mockReturnValue(mockSupabaseClient as any);

    mockReq = {
      requestId: 'test-request-id',
      user: { id: 'user-123', email: 'test@example.com' },
      body: {},
      query: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  describe('toggleLike', () => {
    it('should successfully toggle like for video', async () => {
      const mockRpcResponse = {
        data: [{ liked: true, total_likes: 5 }],
        error: null
      };

      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.body = {
        content_type: 'video',
        content_id: '123e4567-e89b-12d3-a456-426614174000'
      };

      await likesController.toggleLike(mockReq as Request, mockRes as Response);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('toggle_like', {
        p_user_id: 'user-123',
        p_content_type: 'video',
        p_content_id: '123e4567-e89b-12d3-a456-426614174000'
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        liked: true,
        likes_count: 5,
        content_type: 'video',
        content_id: '123e4567-e89b-12d3-a456-426614174000'
      });
    });

    it('should successfully toggle like for post', async () => {
      const mockRpcResponse = {
        data: [{ liked: false, total_likes: 3 }],
        error: null
      };

      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.body = {
        content_type: 'post',
        content_id: '987fcdeb-51a2-43d1-9f12-345678901234'
      };

      await likesController.toggleLike(mockReq as Request, mockRes as Response);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('toggle_like', {
        p_user_id: 'user-123',
        p_content_type: 'post',
        p_content_id: '987fcdeb-51a2-43d1-9f12-345678901234'
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        liked: false,
        likes_count: 3,
        content_type: 'post',
        content_id: '987fcdeb-51a2-43d1-9f12-345678901234'
      });
    });

    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;

      await likesController.toggleLike(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'authentication required'
      });
    });

    it('should return 400 if content_type is missing', async () => {
      mockReq.body = {
        content_id: '123e4567-e89b-12d3-a456-426614174000'
      };

      await likesController.toggleLike(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'content_type and content_id are required'
      });
    });

    it('should return 400 if content_id is missing', async () => {
      mockReq.body = {
        content_type: 'video'
      };

      await likesController.toggleLike(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'content_type and content_id are required'
      });
    });

    it('should return 400 if content_type is invalid', async () => {
      mockReq.body = {
        content_type: 'invalid',
        content_id: '123e4567-e89b-12d3-a456-426614174000'
      };

      await likesController.toggleLike(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'content_type must be either "video" or "post"'
      });
    });

    it('should return 400 if content_id is not a valid UUID', async () => {
      mockReq.body = {
        content_type: 'video',
        content_id: 'invalid-uuid'
      };

      await likesController.toggleLike(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'content_id must be a valid UUID'
      });
    });

    it('should return 404 if content is not found', async () => {
      const mockRpcResponse = {
        data: null,
        error: { message: 'Invalid video_id: 123e4567-e89b-12d3-a456-426614174000' }
      };

      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.body = {
        content_type: 'video',
        content_id: '123e4567-e89b-12d3-a456-426614174000'
      };

      await likesController.toggleLike(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'video not found'
      });
    });

    it('should return 500 if database operation fails', async () => {
      const mockRpcResponse = {
        data: null,
        error: { message: 'Database connection failed' }
      };

      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.body = {
        content_type: 'video',
        content_id: '123e4567-e89b-12d3-a456-426614174000'
      };

      await likesController.toggleLike(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'failed to toggle like'
      });
    });
  });

  describe('getLikeStatus', () => {
    const mockFromChain = {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn()
            }))
          }))
        })),
        count: 'exact',
        head: true
      }))
    };

    beforeEach(() => {
      mockSupabaseClient.from.mockReturnValue(mockFromChain as any);
    });

    it('should successfully get like status when user has liked content', async () => {
      // Mock user has liked the content
      mockFromChain.select().eq().eq().eq().single.mockResolvedValue({
        data: { id: 'like-123' },
        error: null
      });

      // Mock likes count
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          count: 10,
          error: null
        })
      } as any);

      mockReq.query = {
        content_type: 'video',
        content_id: '123e4567-e89b-12d3-a456-426614174000'
      };

      await likesController.getLikeStatus(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          content_type: 'video',
          content_id: '123e4567-e89b-12d3-a456-426614174000',
          liked: true,
          likes_count: 10
        }
      });
    });

    it('should successfully get like status when user has not liked content', async () => {
      // Mock user has not liked the content
      mockFromChain.select().eq().eq().eq().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' } // No rows returned
      });

      // Mock likes count
      mockSupabaseClient.from.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          count: 5,
          error: null
        })
      } as any);

      mockReq.query = {
        content_type: 'post',
        content_id: '987fcdeb-51a2-43d1-9f12-345678901234'
      };

      await likesController.getLikeStatus(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          content_type: 'post',
          content_id: '987fcdeb-51a2-43d1-9f12-345678901234',
          liked: false,
          likes_count: 5
        }
      });
    });

    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;

      await likesController.getLikeStatus(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'authentication required'
      });
    });

    it('should return 400 if content_type is missing', async () => {
      mockReq.query = {
        content_id: '123e4567-e89b-12d3-a456-426614174000'
      };

      await likesController.getLikeStatus(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'content_type and content_id query parameters are required'
      });
    });

    it('should return 400 if content_type is invalid', async () => {
      mockReq.query = {
        content_type: 'invalid',
        content_id: '123e4567-e89b-12d3-a456-426614174000'
      };

      await likesController.getLikeStatus(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'content_type must be either "video" or "post"'
      });
    });
  });

  describe('getUserLikedContent', () => {
    it('should successfully get user liked content', async () => {
      const mockRpcResponse = {
        data: [
          {
            id: 'like-123',
            content_type: 'video',
            content_id: '123e4567-e89b-12d3-a456-426614174000',
            liked_at: '2024-01-01T00:00:00Z',
            content_title: 'Test Video',
            content_body: 'Test video description',
            content_author_username: 'testuser',
            content_created_at: '2023-12-31T00:00:00Z'
          }
        ],
        error: null
      };

      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.query = {
        content_type: 'video',
        limit: '10',
        offset: '0'
      };

      await likesController.getUserLikedContent(mockReq as Request, mockRes as Response);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_user_liked_content', {
        p_user_id: 'user-123',
        p_content_type: 'video',
        p_limit: 10,
        p_offset: 0
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockRpcResponse.data,
        pagination: {
          limit: 10,
          offset: 0,
          has_more: false // Only 1 item returned, less than limit
        }
      });
    });

    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;

      await likesController.getUserLikedContent(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'authentication required'
      });
    });

    it('should handle default parameters correctly', async () => {
      const mockRpcResponse = { data: [], error: null };
      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.query = {}; // No parameters

      await likesController.getUserLikedContent(mockReq as Request, mockRes as Response);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_user_liked_content', {
        p_user_id: 'user-123',
        p_content_type: null, // Default to all content types
        p_limit: 20, // Default limit
        p_offset: 0 // Default offset
      });
    });

    it('should enforce maximum limit of 50', async () => {
      const mockRpcResponse = { data: [], error: null };
      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.query = {
        limit: '100' // Try to exceed maximum
      };

      await likesController.getUserLikedContent(mockReq as Request, mockRes as Response);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_user_liked_content', {
        p_user_id: 'user-123',
        p_content_type: null,
        p_limit: 50, // Should be capped at 50
        p_offset: 0
      });
    });
  });
});