/**
 * Follows Controller Unit Tests
 */

import { Request, Response } from 'express';
import { followsController } from '../../src/controllers/follows';
import { getSupabaseClient } from '../../src/services/supabase';
import { webSocketEventsService } from '../../src/services/websocketEvents';

// Mock dependencies
jest.mock('../../src/services/supabase');

const mockSupabaseClient = {
  rpc: jest.fn(),
  from: jest.fn()
};

const mockGetSupabaseClient = getSupabaseClient as jest.MockedFunction<typeof getSupabaseClient>;

// Create spy for WebSocket service
let emitFollowEventSpy: jest.SpyInstance;

describe('Follows Controller', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSupabaseClient.mockReturnValue(mockSupabaseClient as any);
    
    // Create spy for WebSocket service
    emitFollowEventSpy = jest.spyOn(webSocketEventsService, 'emitFollowEvent').mockResolvedValue(undefined);

    mockReq = {
      requestId: 'test-request-id',
      user: { id: '123e4567-e89b-12d3-a456-426614174001', email: 'test@example.com', username: 'test_user', emailConfirmed: true },
      body: {},
      query: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  describe('toggleFollow', () => {
    it('should successfully toggle follow and emit WebSocket event', async () => {
      const mockRpcResponse = {
        data: [{ 
          following: true, 
          follower_count: 10, 
          following_count: 5 
        }],
        error: null
      };

      // Mock successful toggle_follow RPC call
      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      // Mock target user lookup
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: '123e4567-e89b-12d3-a456-426614174002', username: 'target_user' },
                  error: null
                })
              })
            })
          };
        }
        return mockSupabaseClient.from(table);
      });

      mockReq.body = {
        following_id: '123e4567-e89b-12d3-a456-426614174002'
      };

      await followsController.toggleFollow(mockReq as Request, mockRes as Response, mockNext);

      // Verify database operations
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('toggle_follow', {
        p_follower_id: '123e4567-e89b-12d3-a456-426614174001',
        p_following_id: '123e4567-e89b-12d3-a456-426614174002'
      });

      // Verify WebSocket event emission
      expect(emitFollowEventSpy).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174001',    // followerId
        'test_user',   // followerUsername
        '123e4567-e89b-12d3-a456-426614174002',  // followeeId
        'target_user', // followeeUsername
        true,          // isFollowing
        10             // totalFollowers
      );

      // Verify response
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        following: true,
        follower_count: 10,
        following_count: 5,
        following_id: '123e4567-e89b-12d3-a456-426614174002'
      });
    });

    it('should return 401 if user is not authenticated', async () => {
      (mockReq as any).user = undefined;

      await followsController.toggleFollow(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'authentication required'
      });
      
      // Should not emit WebSocket event
      expect(emitFollowEventSpy).not.toHaveBeenCalled();
    });

    it('should return 400 if following_id is missing', async () => {
      mockReq.body = {};

      await followsController.toggleFollow(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'following_id is required'
      });
      
      // Should not emit WebSocket event
      expect(emitFollowEventSpy).not.toHaveBeenCalled();
    });

    it('should return 400 if following_id is not a valid UUID', async () => {
      mockReq.body = {
        following_id: 'invalid-uuid'
      };

      await followsController.toggleFollow(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'following_id must be a valid UUID'
      });
      
      // Should not emit WebSocket event
      expect(emitFollowEventSpy).not.toHaveBeenCalled();
    });

    it('should return 400 if user tries to follow themselves', async () => {
      mockReq.body = {
        following_id: '123e4567-e89b-12d3-a456-426614174001' // Same as current user ID
      };

      await followsController.toggleFollow(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'users cannot follow themselves'
      });
      
      // Should not emit WebSocket event
      expect(emitFollowEventSpy).not.toHaveBeenCalled();
    });

    it('should return 404 if target user does not exist', async () => {
      // Mock user not found
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'User not found' }
                })
              })
            })
          };
        }
        return mockSupabaseClient.from(table);
      });

      mockReq.body = {
        following_id: '123e4567-e89b-12d3-a456-426614174000'
      };

      await followsController.toggleFollow(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'user not found'
      });
      
      // Should not emit WebSocket event
      expect(emitFollowEventSpy).not.toHaveBeenCalled();
    });

    it('should continue successfully even if WebSocket emission fails', async () => {
      // Mock WebSocket failure
      emitFollowEventSpy.mockRejectedValue(new Error('WebSocket failed'));

      const mockRpcResponse = {
        data: [{ 
          following: true, 
          follower_count: 10, 
          following_count: 5 
        }],
        error: null
      };

      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      // Mock target user lookup
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: '123e4567-e89b-12d3-a456-426614174002', username: 'target_user' },
                  error: null
                })
              })
            })
          };
        }
        return mockSupabaseClient.from(table);
      });

      mockReq.body = {
        following_id: '123e4567-e89b-12d3-a456-426614174002'
      };

      await followsController.toggleFollow(mockReq as Request, mockRes as Response, mockNext);

      expect(emitFollowEventSpy).toHaveBeenCalled();
      
      // Should still return success even if WebSocket fails
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        following: true,
        follower_count: 10,
        following_count: 5,
        following_id: '123e4567-e89b-12d3-a456-426614174002'
      });
    });

    it('should use fallback username when user username is missing', async () => {
      const mockRpcResponse = {
        data: [{ 
          following: true, 
          follower_count: 10, 
          following_count: 5 
        }],
        error: null
      };

      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      // Mock target user lookup
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: '123e4567-e89b-12d3-a456-426614174002', username: 'target_user' },
                  error: null
                })
              })
            })
          };
        }
        return mockSupabaseClient.from(table);
      });

      mockReq.body = {
        following_id: '123e4567-e89b-12d3-a456-426614174002'
      };
      mockReq.user = { id: '123e4567-e89b-12d3-a456-426614174001', email: 'test@example.com', emailConfirmed: true }; // No username

      await followsController.toggleFollow(mockReq as Request, mockRes as Response, mockNext);

      expect(emitFollowEventSpy).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174001',      // followerId
        'Unknown User',  // followerUsername (fallback)
        '123e4567-e89b-12d3-a456-426614174002',    // followeeId
        'target_user',   // followeeUsername
        true,            // isFollowing
        10               // totalFollowers
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
});