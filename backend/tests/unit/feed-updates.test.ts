/**
 * Feed Updates Unit Tests
 * Tests for real-time feed content updates functionality
 */

import { feedUpdatesService } from '../../src/services/feedUpdates';
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
  rpc: jest.fn()
};

const mockWebSocketEventsService = {
  emitFeedUpdate: jest.fn(),
  batchEmitFeedUpdates: jest.fn(),
  emitPriorityFeedUpdate: jest.fn()
};

beforeEach(() => {
  jest.clearAllMocks();
  (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  (webSocketEventsService.emitFeedUpdate as jest.Mock) = mockWebSocketEventsService.emitFeedUpdate;
  (webSocketEventsService.batchEmitFeedUpdates as jest.Mock) = mockWebSocketEventsService.batchEmitFeedUpdates;
  (webSocketEventsService.emitPriorityFeedUpdate as jest.Mock) = mockWebSocketEventsService.emitPriorityFeedUpdate;
});

describe('FeedUpdatesService', () => {
  const mockUserId = 'user-123';
  const mockPostId = 'post-456';
  const mockUsername = 'testuser';

  describe('notifyFollowersOfNewPost', () => {
    it('should notify all followers when a new post is created', async () => {
      // Arrange
      const mockFollowers = [
        { follower_id: 'follower-1' },
        { follower_id: 'follower-2' },
        { follower_id: 'follower-3' }
      ];

      const mockPost = {
        id: mockPostId,
        user_id: mockUserId,
        content: 'Test post content',
        post_type: 'Recovery Update',
        created_at: new Date().toISOString()
      };

      // Mock Supabase queries
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnValue({ data: mockFollowers, error: null })
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      // Act
      await feedUpdatesService.notifyFollowersOfNewPost(mockPost, mockUsername);

      // Assert
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('follows');
      expect(mockQuery.select).toHaveBeenCalledWith('follower_id');
      expect(mockQuery.eq).toHaveBeenCalledWith('following_id', mockUserId);
      expect(mockWebSocketEventsService.batchEmitFeedUpdates).toHaveBeenCalledWith(
        mockFollowers.map(f => f.follower_id),
        expect.objectContaining({
          postId: mockPostId,
          authorId: mockUserId,
          authorUsername: mockUsername,
          type: 'new_post'
        })
      );
    });

    it('should handle case with no followers gracefully', async () => {
      // Arrange
      const mockPost = {
        id: mockPostId,
        user_id: mockUserId,
        content: 'Test post content',
        post_type: 'Recovery Update',
        created_at: new Date().toISOString()
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnValue({ data: [], error: null })
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      // Act
      await feedUpdatesService.notifyFollowersOfNewPost(mockPost, mockUsername);

      // Assert
      expect(mockWebSocketEventsService.batchEmitFeedUpdates).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'No followers to notify for new post',
        expect.objectContaining({
          postId: mockPostId,
          authorId: mockUserId
        })
      );
    });

    it('should handle database errors when fetching followers', async () => {
      // Arrange
      const mockPost = {
        id: mockPostId,
        user_id: mockUserId,
        content: 'Test post content',
        post_type: 'Recovery Update',
        created_at: new Date().toISOString()
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnValue({ data: null, error: { message: 'Database error' } })
      };
      mockSupabaseClient.from.mockReturnValue(mockQuery);

      // Act & Assert
      await expect(
        feedUpdatesService.notifyFollowersOfNewPost(mockPost, mockUsername)
      ).rejects.toThrow('Database error');
      
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to notify followers of new post',
        expect.objectContaining({
          error: 'Database error'
        })
      );
    });
  });

  describe('processInstantFeedRefresh', () => {
    it('should trigger instant feed refresh for specific users', async () => {
      // Arrange
      const userIds = ['user-1', 'user-2', 'user-3'];
      const mockFeedUpdate = {
        postId: mockPostId,
        authorId: mockUserId,
        authorUsername: mockUsername,
        content: 'Test content',
        createdAt: new Date(),
        type: 'new_post' as const
      };

      // Act
      await feedUpdatesService.processInstantFeedRefresh(userIds, mockFeedUpdate);

      // Assert
      expect(mockWebSocketEventsService.batchEmitFeedUpdates).toHaveBeenCalledWith(
        userIds,
        mockFeedUpdate
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Instant feed refresh processed',
        expect.objectContaining({
          userCount: userIds.length,
          postId: mockPostId
        })
      );
    });

    it('should handle empty user list gracefully', async () => {
      // Arrange
      const userIds: string[] = [];
      const mockFeedUpdate = {
        postId: mockPostId,
        authorId: mockUserId,
        authorUsername: mockUsername,
        content: 'Test content',
        createdAt: new Date(),
        type: 'new_post' as const
      };

      // Act
      await feedUpdatesService.processInstantFeedRefresh(userIds, mockFeedUpdate);

      // Assert
      expect(mockWebSocketEventsService.batchEmitFeedUpdates).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'No users to refresh for instant feed update',
        expect.objectContaining({
          postId: mockPostId
        })
      );
    });
  });

  describe('processFeedUpdateBatch', () => {
    it('should process multiple feed updates efficiently', async () => {
      // Arrange
      const feedUpdates = [
        {
          postId: 'post-1',
          authorId: 'author-1',
          authorUsername: 'author1',
          content: 'Content 1',
          createdAt: new Date(),
          type: 'new_post' as const
        },
        {
          postId: 'post-2',
          authorId: 'author-2',
          authorUsername: 'author2',
          content: 'Content 2',
          createdAt: new Date(),
          type: 'trending' as const
        }
      ];

      const userIds = ['user-1', 'user-2'];

      // Act
      await feedUpdatesService.processFeedUpdateBatch(userIds, feedUpdates);

      // Assert
      expect(mockWebSocketEventsService.batchEmitFeedUpdates).toHaveBeenCalledWith(
        userIds,
        feedUpdates
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Feed update batch processed',
        expect.objectContaining({
          userCount: userIds.length,
          updateCount: feedUpdates.length
        })
      );
    });

    it('should reject batch if it exceeds maximum size', async () => {
      // Arrange
      const feedUpdates = Array(101).fill(null).map((_, i) => ({
        postId: `post-${i}`,
        authorId: `author-${i}`,
        authorUsername: `author${i}`,
        content: `Content ${i}`,
        createdAt: new Date(),
        type: 'new_post' as const
      }));

      const userIds = ['user-1'];

      // Act & Assert
      await expect(
        feedUpdatesService.processFeedUpdateBatch(userIds, feedUpdates)
      ).rejects.toThrow('Feed update batch size exceeds maximum limit of 100');
    });
  });

  describe('priorityFeedUpdate', () => {
    it('should send priority feed updates to active users first', async () => {
      // Arrange
      const mockActiveUsers = ['active-user-1', 'active-user-2'];
      const mockAllUsers = ['active-user-1', 'active-user-2', 'inactive-user-1'];
      
      const mockFeedUpdate = {
        postId: mockPostId,
        authorId: mockUserId,
        authorUsername: mockUsername,
        content: 'Priority content',
        createdAt: new Date(),
        type: 'trending' as const,
        priority: 'high' as const,
        urgency: 8,
        targetUserIds: mockActiveUsers
      };

      // Act
      await feedUpdatesService.processPriorityFeedUpdate(
        mockAllUsers,
        mockActiveUsers,
        mockFeedUpdate
      );

      // Assert
      expect(mockWebSocketEventsService.emitPriorityFeedUpdate).toHaveBeenCalledWith(
        mockActiveUsers,
        mockFeedUpdate,
        'high'
      );
      
      // Should also send to inactive users with lower priority
      expect(mockWebSocketEventsService.emitFeedUpdate).toHaveBeenCalledWith(
        ['inactive-user-1'],
        { ...mockFeedUpdate, priority: 'normal' }
      );
    });

    it('should handle case where all users are active', async () => {
      // Arrange
      const mockUsers = ['user-1', 'user-2', 'user-3'];
      const mockFeedUpdate = {
        postId: mockPostId,
        authorId: mockUserId,
        authorUsername: mockUsername,
        content: 'Priority content',
        createdAt: new Date(),
        type: 'trending' as const,
        priority: 'high' as const,
        urgency: 8,
        targetUserIds: mockUsers
      };

      // Act
      await feedUpdatesService.processPriorityFeedUpdate(
        mockUsers,
        mockUsers,
        mockFeedUpdate
      );

      // Assert
      expect(mockWebSocketEventsService.emitPriorityFeedUpdate).toHaveBeenCalledWith(
        mockUsers,
        mockFeedUpdate,
        'high'
      );
      expect(mockWebSocketEventsService.emitFeedUpdate).not.toHaveBeenCalled();
    });
  });

  describe('resolveFeedUpdateConflicts', () => {
    it('should resolve conflicts between concurrent feed updates', async () => {
      // Arrange
      const conflictingUpdates = [
        {
          postId: mockPostId,
          authorId: mockUserId,
          timestamp: new Date('2025-01-01T10:00:00Z'),
          type: 'new_post' as const
        },
        {
          postId: mockPostId,
          authorId: mockUserId,
          timestamp: new Date('2025-01-01T10:00:05Z'),
          type: 'trending' as const
        }
      ];

      // Act
      const resolvedUpdate = await feedUpdatesService.resolveFeedUpdateConflicts(
        conflictingUpdates
      );

      // Assert - should prioritize the most recent update
      expect(resolvedUpdate.type).toBe('trending');
      expect(resolvedUpdate.timestamp).toEqual(new Date('2025-01-01T10:00:05Z'));
      expect(logger.info).toHaveBeenCalledWith(
        'Feed update conflicts resolved',
        expect.objectContaining({
          conflictCount: 2,
          resolvedType: 'trending'
        })
      );
    });

    it('should return single update when no conflicts exist', async () => {
      // Arrange
      const singleUpdate = {
        postId: mockPostId,
        authorId: mockUserId,
        timestamp: new Date(),
        type: 'new_post' as const
      };

      // Act
      const resolvedUpdate = await feedUpdatesService.resolveFeedUpdateConflicts([singleUpdate]);

      // Assert
      expect(resolvedUpdate).toEqual(singleUpdate);
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('conflicts resolved'),
        expect.anything()
      );
    });
  });

  describe('generatePersonalizedFeedUpdates', () => {
    it('should generate personalized feed updates based on user preferences', async () => {
      // Arrange
      const userId = 'user-123';
      const mockUserPreferences = {
        preferred_post_types: ['Recovery Update', 'Milestone'],
        followed_users: ['author-1', 'author-2'],
        interaction_history: {
          likes: 15,
          comments: 5,
          shares: 2
        }
      };

      const mockAvailablePosts = [
        {
          id: 'post-1',
          user_id: 'author-1',
          post_type: 'Recovery Update',
          likes_count: 10,
          comments_count: 3
        },
        {
          id: 'post-2',
          user_id: 'author-3',
          post_type: 'Question',
          likes_count: 5,
          comments_count: 1
        }
      ];

      // Mock user preferences query
      const mockPreferencesQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnValue({ 
          data: [mockUserPreferences], 
          error: null 
        })
      };
      
      // Mock posts query
      const mockPostsQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnValue({ 
          data: mockAvailablePosts, 
          error: null 
        })
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'user_preferences') return mockPreferencesQuery;
        if (table === 'posts') return mockPostsQuery;
        return mockSupabaseClient;
      });

      // Act
      const personalizedUpdates = await feedUpdatesService.generatePersonalizedFeedUpdates(
        userId,
        10
      );

      // Assert
      expect(personalizedUpdates).toHaveLength(2); // Both posts get scores above threshold
      expect(personalizedUpdates[0]).toEqual(
        expect.objectContaining({
          postId: 'post-1',
          authorId: 'author-1',
          type: 'recommended',
          personalizedScore: 25 // 5 (preferred type) + 10 (followed user) + 10 (engagement)
        })
      );
      expect(personalizedUpdates[1]).toEqual(
        expect.objectContaining({
          postId: 'post-2',
          authorId: 'author-3',
          type: 'recommended',
          personalizedScore: 7 // 0 + 0 + 7 (engagement, max 10)
        })
      );
    });

    it('should handle users with no preferences gracefully', async () => {
      // Arrange
      const userId = 'user-123';
      
      const mockPreferencesQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnValue({ data: [], error: null })
      };
      
      mockSupabaseClient.from.mockReturnValue(mockPreferencesQuery);

      // Act
      const personalizedUpdates = await feedUpdatesService.generatePersonalizedFeedUpdates(
        userId,
        10
      );

      // Assert
      expect(personalizedUpdates).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith(
        'No user preferences found, using default feed algorithm',
        expect.objectContaining({ userId })
      );
    });
  });
});