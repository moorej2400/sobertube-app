/**
 * Comments Controller Unit Tests
 */

import { Request, Response } from 'express';
import { commentsController } from '../../src/controllers/comments';
import { getSupabaseClient } from '../../src/services/supabase';
import { logger } from '../../src/utils/logger';
import { webSocketEventsService } from '../../src/services/websocketEvents';

// Mock dependencies
jest.mock('../../src/services/supabase');
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/websocketEvents');

const mockSupabaseClient = {
  rpc: jest.fn(),
  from: jest.fn(() => ({
    delete: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn()
        }))
      }))
    })),
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn()
      }))
    }))
  }))
};

const mockGetSupabaseClient = getSupabaseClient as jest.MockedFunction<typeof getSupabaseClient>;
const mockLogger = logger as jest.Mocked<typeof logger>;
const mockWebSocketEventsService = webSocketEventsService as jest.Mocked<typeof webSocketEventsService>;

describe('Comments Controller', () => {
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
      query: {},
      params: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  describe('createComment', () => {
    it('should successfully create a comment on video', async () => {
      const mockRpcResponse = {
        data: [{
          id: 'comment-123',
          user_id: 'user-123',
          username: 'testuser',
          display_name: 'Test User',
          profile_picture_url: 'https://example.com/avatar.jpg',
          content: 'Great video!',
          likes_count: 0,
          replies_count: 0,
          is_edited: false,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          parent_comment_id: null
        }],
        error: null
      };

      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.body = {
        content_type: 'video',
        content_id: '123e4567-e89b-12d3-a456-426614174000',
        content: 'Great video!'
      };

      await commentsController.createComment(mockReq as Request, mockRes as Response);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('create_comment', {
        p_user_id: 'user-123',
        p_content_type: 'video',
        p_content_id: '123e4567-e89b-12d3-a456-426614174000',
        p_content: 'Great video!',
        p_parent_comment_id: null
      });

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockRpcResponse.data[0]
      });
    });

    it('should successfully create a reply comment', async () => {
      const mockRpcResponse = {
        data: [{
          id: 'comment-456',
          user_id: 'user-123',
          username: 'testuser',
          display_name: 'Test User',
          profile_picture_url: null,
          content: 'Thanks for watching!',
          likes_count: 0,
          replies_count: 0,
          is_edited: false,
          created_at: '2024-01-01T01:00:00Z',
          updated_at: '2024-01-01T01:00:00Z',
          parent_comment_id: 'parent-comment-123'
        }],
        error: null
      };

      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.body = {
        content_type: 'post',
        content_id: '987fcdeb-51a2-43d1-9f12-345678901234',
        content: 'Thanks for watching!',
        parent_comment_id: 'parent-comment-123'
      };

      await commentsController.createComment(mockReq as Request, mockRes as Response);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('create_comment', {
        p_user_id: 'user-123',
        p_content_type: 'post',
        p_content_id: '987fcdeb-51a2-43d1-9f12-345678901234',
        p_content: 'Thanks for watching!',
        p_parent_comment_id: 'parent-comment-123'
      });

      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;

      await commentsController.createComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'authentication required'
      });
    });

    it('should return 400 if required fields are missing', async () => {
      mockReq.body = {
        content_type: 'video'
        // Missing content_id and content
      };

      await commentsController.createComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'content_type, content_id, and content are required'
      });
    });

    it('should return 400 if content_type is invalid', async () => {
      mockReq.body = {
        content_type: 'invalid',
        content_id: '123e4567-e89b-12d3-a456-426614174000',
        content: 'Test comment'
      };

      await commentsController.createComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'content_type must be either "video" or "post"'
      });
    });

    it('should return 400 if content_id is not a valid UUID', async () => {
      mockReq.body = {
        content_type: 'video',
        content_id: 'invalid-uuid',
        content: 'Test comment'
      };

      await commentsController.createComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'content_id must be a valid UUID'
      });
    });

    it('should return 400 if content is too long', async () => {
      mockReq.body = {
        content_type: 'video',
        content_id: '123e4567-e89b-12d3-a456-426614174000',
        content: 'a'.repeat(2001) // Exceeds 2000 character limit
      };

      await commentsController.createComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'comment content must be between 1 and 2000 characters'
      });
    });

    it('should return 400 if content is empty', async () => {
      mockReq.body = {
        content_type: 'video',
        content_id: '123e4567-e89b-12d3-a456-426614174000',
        content: '   ' // Only whitespace
      };

      await commentsController.createComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'comment content must be between 1 and 2000 characters'
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
        content_id: '123e4567-e89b-12d3-a456-426614174000',
        content: 'Test comment'
      };

      await commentsController.createComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'video not found'
      });
    });

    it('should return 400 if parent comment validation fails', async () => {
      const mockRpcResponse = {
        data: null,
        error: { message: 'Parent comment must belong to the same content' }
      };

      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.body = {
        content_type: 'video',
        content_id: '123e4567-e89b-12d3-a456-426614174000',
        content: 'Test reply',
        parent_comment_id: 'wrong-parent-123'
      };

      await commentsController.createComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'parent comment must belong to the same content'
      });
    });
  });

  describe('getComments', () => {
    it('should successfully get comments for video', async () => {
      const mockRpcResponse = {
        data: [
          {
            id: 'comment-123',
            user_id: 'user-123',
            username: 'testuser',
            display_name: 'Test User',
            profile_picture_url: null,
            content: 'Great video!',
            likes_count: 5,
            replies_count: 2,
            is_edited: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            parent_comment_id: null
          }
        ],
        error: null
      };

      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.query = {
        content_type: 'video',
        content_id: '123e4567-e89b-12d3-a456-426614174000',
        limit: '10',
        offset: '0',
        sort_order: 'newest'
      };

      await commentsController.getComments(mockReq as Request, mockRes as Response);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_comments_for_content', {
        p_content_type: 'video',
        p_content_id: '123e4567-e89b-12d3-a456-426614174000',
        p_parent_comment_id: null,
        p_limit: 11, // +1 to check for more
        p_offset: 0,
        p_sort_order: 'newest'
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockRpcResponse.data,
        pagination: {
          limit: 10,
          offset: 0,
          has_more: false,
          total_returned: 1
        },
        metadata: {
          content_type: 'video',
          content_id: '123e4567-e89b-12d3-a456-426614174000',
          parent_comment_id: null,
          sort_order: 'newest'
        }
      });
    });

    it('should successfully get replies to a specific comment', async () => {
      const mockRpcResponse = {
        data: [
          {
            id: 'reply-123',
            user_id: 'user-456',
            username: 'replier',
            display_name: 'Reply User',
            profile_picture_url: null,
            content: 'Thanks for the comment!',
            likes_count: 1,
            replies_count: 0,
            is_edited: false,
            created_at: '2024-01-01T01:00:00Z',
            updated_at: '2024-01-01T01:00:00Z',
            parent_comment_id: 'parent-comment-123'
          }
        ],
        error: null
      };

      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.query = {
        content_type: 'video',
        content_id: '123e4567-e89b-12d3-a456-426614174000',
        parent_comment_id: 'parent-comment-123'
      };

      await commentsController.getComments(mockReq as Request, mockRes as Response);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_comments_for_content', {
        p_content_type: 'video',
        p_content_id: '123e4567-e89b-12d3-a456-426614174000',
        p_parent_comment_id: 'parent-comment-123',
        p_limit: 21, // default 20 + 1
        p_offset: 0,
        p_sort_order: 'newest'
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 if required parameters are missing', async () => {
      mockReq.query = {
        content_type: 'video'
        // Missing content_id
      };

      await commentsController.getComments(mockReq as Request, mockRes as Response);

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

      await commentsController.getComments(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'content_type must be either "video" or "post"'
      });
    });

    it('should return 400 if sort_order is invalid', async () => {
      mockReq.query = {
        content_type: 'video',
        content_id: '123e4567-e89b-12d3-a456-426614174000',
        sort_order: 'invalid'
      };

      await commentsController.getComments(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'sort_order must be one of: newest, oldest, most_liked'
      });
    });

    it('should enforce maximum limit of 100', async () => {
      const mockRpcResponse = { data: [], error: null };
      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.query = {
        content_type: 'video',
        content_id: '123e4567-e89b-12d3-a456-426614174000',
        limit: '200' // Exceeds maximum
      };

      await commentsController.getComments(mockReq as Request, mockRes as Response);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_comments_for_content', {
        p_content_type: 'video',
        p_content_id: '123e4567-e89b-12d3-a456-426614174000',
        p_parent_comment_id: null,
        p_limit: 101, // Should be capped at 100 + 1
        p_offset: 0,
        p_sort_order: 'newest'
      });
    });
  });

  describe('updateComment', () => {
    it('should successfully update a comment', async () => {
      const mockRpcResponse = {
        data: [{
          id: 'comment-123',
          user_id: 'user-123',
          username: 'testuser',
          display_name: 'Test User',
          profile_picture_url: null,
          content: 'Updated comment content',
          likes_count: 5,
          replies_count: 2,
          is_edited: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T01:00:00Z',
          parent_comment_id: null
        }],
        error: null
      };

      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.params = { id: 'comment-123' };
      mockReq.body = { content: 'Updated comment content' };

      await commentsController.updateComment(mockReq as Request, mockRes as Response);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('update_comment', {
        p_comment_id: 'comment-123',
        p_user_id: 'user-123',
        p_new_content: 'Updated comment content'
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockRpcResponse.data[0]
      });
    });

    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.params = { id: 'comment-123' };

      await commentsController.updateComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'authentication required'
      });
    });

    it('should return 400 if comment ID is not a valid UUID', async () => {
      mockReq.params = { id: 'invalid-uuid' };
      mockReq.body = { content: 'Updated content' };

      await commentsController.updateComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'comment ID must be a valid UUID'
      });
    });

    it('should return 404 if comment not found or user lacks permission', async () => {
      const mockRpcResponse = { data: [], error: null };
      mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);

      mockReq.params = { id: '123e4567-e89b-12d3-a456-426614174000' };
      mockReq.body = { content: 'Updated content' };

      await commentsController.updateComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'comment not found or you do not have permission to update it'
      });
    });
  });

  describe('deleteComment', () => {
    it('should successfully delete a comment', async () => {
      const mockDeleteResponse = {
        data: [{
          id: 'comment-123',
          content_type: 'video',
          content_id: '123e4567-e89b-12d3-a456-426614174000',
          parent_comment_id: null
        }],
        error: null
      };

      mockSupabaseClient.from().delete().eq().eq().select.mockResolvedValue(mockDeleteResponse);

      mockReq.params = { id: 'comment-123' };

      await commentsController.deleteComment(mockReq as Request, mockRes as Response);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('comments');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'comment deleted successfully',
        data: {
          id: 'comment-123',
          deleted_at: expect.any(String)
        }
      });
    });

    it('should return 401 if user is not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.params = { id: 'comment-123' };

      await commentsController.deleteComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'authentication required'
      });
    });

    it('should return 400 if comment ID is not a valid UUID', async () => {
      mockReq.params = { id: 'invalid-uuid' };

      await commentsController.deleteComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'comment ID must be a valid UUID'
      });
    });

    it('should return 404 if comment not found or user lacks permission', async () => {
      const mockDeleteResponse = { data: [], error: null };
      mockSupabaseClient.from().delete().eq().eq().select.mockResolvedValue(mockDeleteResponse);

      mockReq.params = { id: '123e4567-e89b-12d3-a456-426614174000' };

      await commentsController.deleteComment(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'comment not found or you do not have permission to delete it'
      });
    });
  });

  describe('WebSocket Integration', () => {
    beforeEach(() => {
      // Reset WebSocket service mock
      jest.clearAllMocks();
      mockWebSocketEventsService.emitCommentEvent = jest.fn().mockResolvedValue(undefined);
      mockWebSocketEventsService.emitCommentUpdateEvent = jest.fn().mockResolvedValue(undefined);
      mockWebSocketEventsService.emitCommentDeleteEvent = jest.fn().mockResolvedValue(undefined);
    });

    describe('createComment WebSocket integration', () => {
      it('should emit WebSocket event when creating a comment on video', async () => {
        const mockRpcResponse = {
          data: [{
            id: 'comment-123',
            user_id: 'user-123',
            username: 'testuser',
            display_name: 'Test User',
            profile_picture_url: null,
            content: 'Great video!',
            likes_count: 0,
            replies_count: 0,
            is_edited: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            parent_comment_id: null
          }],
          error: null
        };

        const mockVideoData = {
          data: {
            user_id: 'author-123',
            users: { username: 'video_author' }
          },
          error: null
        };

        mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);
        mockSupabaseClient.from().select().eq().single.mockResolvedValue(mockVideoData);

        mockReq.body = {
          content_type: 'video',
          content_id: '123e4567-e89b-12d3-a456-426614174000',
          content: 'Great video!'
        };
        mockReq.user = { id: 'user-123', username: 'testuser' };

        await commentsController.createComment(mockReq as Request, mockRes as Response);

        expect(mockWebSocketEventsService.emitCommentEvent).toHaveBeenCalledWith(
          'comment-123',
          '123e4567-e89b-12d3-a456-426614174000',
          'author-123',
          'user-123',
          'testuser',
          'Great video!',
          undefined
        );
        expect(mockRes.status).toHaveBeenCalledWith(201);
      });

      it('should emit WebSocket event when creating a reply comment on post', async () => {
        const mockRpcResponse = {
          data: [{
            id: 'comment-456',
            user_id: 'user-123',
            username: 'testuser',
            display_name: 'Test User',
            profile_picture_url: null,
            content: 'Great post!',
            likes_count: 0,
            replies_count: 0,
            is_edited: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            parent_comment_id: 'parent-comment-123'
          }],
          error: null
        };

        const mockPostData = {
          data: {
            user_id: 'author-456',
            users: { username: 'post_author' }
          },
          error: null
        };

        mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);
        mockSupabaseClient.from().select().eq().single.mockResolvedValue(mockPostData);

        mockReq.body = {
          content_type: 'post',
          content_id: '987fcdeb-51a2-43d1-9f12-345678901234',
          content: 'Great post!',
          parent_comment_id: 'parent-comment-123'
        };
        mockReq.user = { id: 'user-123', username: 'testuser' };

        await commentsController.createComment(mockReq as Request, mockRes as Response);

        expect(mockWebSocketEventsService.emitCommentEvent).toHaveBeenCalledWith(
          'comment-456',
          '987fcdeb-51a2-43d1-9f12-345678901234',
          'author-456',
          'user-123',
          'testuser',
          'Great post!',
          'parent-comment-123'
        );
        expect(mockRes.status).toHaveBeenCalledWith(201);
      });

      it('should not fail if WebSocket event emission fails', async () => {
        const mockRpcResponse = {
          data: [{
            id: 'comment-123',
            user_id: 'user-123',
            username: 'testuser',
            content: 'Great video!',
            parent_comment_id: null
          }],
          error: null
        };

        const mockVideoData = {
          data: {
            user_id: 'author-123',
            users: { username: 'video_author' }
          },
          error: null
        };

        mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);
        mockSupabaseClient.from().select().eq().single.mockResolvedValue(mockVideoData);
        mockWebSocketEventsService.emitCommentEvent.mockRejectedValue(new Error('WebSocket failed'));

        mockReq.body = {
          content_type: 'video',
          content_id: '123e4567-e89b-12d3-a456-426614174000',
          content: 'Great video!'
        };
        mockReq.user = { id: 'user-123', username: 'testuser' };

        await commentsController.createComment(mockReq as Request, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(201);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Failed to emit WebSocket comment event',
          expect.objectContaining({
            error: 'WebSocket failed'
          })
        );
      });
    });

    describe('updateComment WebSocket integration', () => {
      it('should emit WebSocket update event when updating a comment', async () => {
        const mockRpcResponse = {
          data: [{
            id: 'comment-123',
            user_id: 'user-123',
            username: 'testuser',
            content: 'Updated comment',
            parent_comment_id: null
          }],
          error: null
        };

        const mockCommentInfo = {
          data: {
            content_type: 'video',
            content_id: '123e4567-e89b-12d3-a456-426614174000'
          },
          error: null
        };

        const mockVideoData = {
          data: {
            user_id: 'author-123',
            users: { username: 'video_author' }
          },
          error: null
        };

        mockSupabaseClient.rpc.mockResolvedValue(mockRpcResponse);
        // Mock the comment info query then the video data query
        mockSupabaseClient.from().select().eq().single
          .mockResolvedValueOnce(mockCommentInfo)
          .mockResolvedValueOnce(mockVideoData);

        mockReq.params = { id: 'comment-123' };
        mockReq.body = { content: 'Updated comment' };
        mockReq.user = { id: 'user-123', username: 'testuser' };

        await commentsController.updateComment(mockReq as Request, mockRes as Response);

        expect(mockWebSocketEventsService.emitCommentUpdateEvent).toHaveBeenCalledWith(
          'comment-123',
          '123e4567-e89b-12d3-a456-426614174000',
          'author-123',
          'user-123',
          'testuser',
          'Updated comment',
          null
        );
        expect(mockRes.status).toHaveBeenCalledWith(200);
      });
    });

    describe('deleteComment WebSocket integration', () => {
      it('should emit WebSocket delete event when deleting a comment', async () => {
        const mockDeleteResponse = {
          data: [{
            id: 'comment-123',
            content_type: 'post',
            content_id: '987fcdeb-51a2-43d1-9f12-345678901234',
            parent_comment_id: null
          }],
          error: null
        };

        const mockPostData = {
          data: {
            user_id: 'author-456',
            users: { username: 'post_author' }
          },
          error: null
        };

        mockSupabaseClient.from().delete().eq().eq().select.mockResolvedValue(mockDeleteResponse);
        mockSupabaseClient.from().select().eq().single.mockResolvedValue(mockPostData);

        mockReq.params = { id: 'comment-123' };
        mockReq.user = { id: 'user-123', username: 'testuser' };

        await commentsController.deleteComment(mockReq as Request, mockRes as Response);

        expect(mockWebSocketEventsService.emitCommentDeleteEvent).toHaveBeenCalledWith(
          'comment-123',
          '987fcdeb-51a2-43d1-9f12-345678901234',
          'author-456',
          'user-123',
          'testuser'
        );
        expect(mockRes.status).toHaveBeenCalledWith(200);
      });
    });
  });
});