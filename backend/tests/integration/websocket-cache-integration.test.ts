/**
 * WebSocket Cache Integration Tests
 * Testing real-time caching with WebSocket events
 */

// Mock Redis client
const mockRedisClient = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  isOpen: false,
  isReady: true,
  on: jest.fn(),
  ping: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  keys: jest.fn(),
  mget: jest.fn(),
  mset: jest.fn(),
  incr: jest.fn(),
  decr: jest.fn(),
  sadd: jest.fn(),
  smembers: jest.fn(),
  srem: jest.fn(),
  sismember: jest.fn(),
  hset: jest.fn(),
  hget: jest.fn(),
  hgetall: jest.fn(),
  hdel: jest.fn(),
  zAdd: jest.fn(),
  zrange: jest.fn(),
  zrem: jest.fn(),
  zcard: jest.fn(),
  flushall: jest.fn(),
  flushAll: jest.fn(),
  info: jest.fn(),
};

// Mock WebSocket server
const mockWebSocketServer = {
  broadcastToUser: jest.fn(),
  broadcastToAll: jest.fn(),
  getIOServer: jest.fn(() => ({
    to: jest.fn(() => ({
      emit: jest.fn()
    }))
  }))
};

// Mock Redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient)
}));

import { WebSocketEventsService } from '../../src/services/websocketEvents';
import { RedisCacheService } from '../../src/services/redisCacheService';
import { logger } from '../../src/utils/logger';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('WebSocket Cache Integration', () => {
  let websocketService: WebSocketEventsService;
  let cacheService: RedisCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.isReady = true;
    mockRedisClient.isOpen = true;
    
    // Initialize services
    websocketService = WebSocketEventsService.getInstance();
    websocketService.setWebSocketServer(mockWebSocketServer);
    
    cacheService = new RedisCacheService(undefined, mockRedisClient);
  });

  afterEach(async () => {
    await cacheService.disconnect();
  });

  describe('Event Deduplication with Real-time Events', () => {
    it('should prevent duplicate like events using cache', async () => {
      const eventId = 'like:post123:user456:1234567890';
      const likeData = {
        postId: 'post123',
        userId: 'user456',
        username: 'testuser',
        isLiked: true,
        totalLikes: 5,
        timestamp: new Date()
      };

      // First like event - should be cached
      mockRedisClient.set.mockResolvedValueOnce('OK'); // Event cached successfully

      const firstResult = await cacheService.cacheEvent(eventId, likeData, 60);
      expect(firstResult).toBe(true);

      // Attempt duplicate like event - should be prevented
      mockRedisClient.set.mockResolvedValueOnce(null); // Key already exists

      const duplicateResult = await cacheService.cacheEvent(eventId, likeData, 60);
      expect(duplicateResult).toBe(false);

      // Check if event is duplicate
      mockRedisClient.exists.mockResolvedValueOnce(1); // Event exists
      const isDuplicate = await cacheService.isEventDuplicate(eventId);
      expect(isDuplicate).toBe(true);
    });

    it('should prevent duplicate comment events using cache', async () => {
      const commentId = 'comment123';
      const eventId = `comment:${commentId}:create:${Date.now()}`;
      const commentData = {
        commentId,
        postId: 'post123',
        userId: 'user456',
        username: 'testuser',
        content: 'Great post!',
        createdAt: new Date()
      };

      // Cache comment creation event
      mockRedisClient.set.mockResolvedValueOnce('OK');
      mockRedisClient.exists.mockResolvedValueOnce(0);

      const result = await cacheService.cacheEvent(eventId, commentData, 60);
      expect(result).toBe(true);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `event:${eventId}`,
        JSON.stringify(commentData),
        { EX: 60, NX: true }
      );
    });
  });

  describe('Cache Invalidation with WebSocket Updates', () => {
    it('should invalidate user cache when user preferences change', async () => {
      const userId = 'user123';
      
      mockRedisClient.keys.mockResolvedValue(['feed:user123:posts', 'recommendations:user123:general']);
      mockRedisClient.del.mockResolvedValue(2);

      await cacheService.invalidateUserCache(userId);

      expect(mockRedisClient.keys).toHaveBeenCalledTimes(4); // 4 patterns
      expect(mockRedisClient.del).toHaveBeenCalledWith(['feed:user123:posts', 'recommendations:user123:general']);
    });

    it('should invalidate content cache when content is updated', async () => {
      const contentType = 'post';
      const contentId = 'post123';
      
      mockRedisClient.keys.mockResolvedValue([`${contentType}:${contentId}:stats`]);
      mockRedisClient.del.mockResolvedValue(1);

      await cacheService.invalidateContentCache(contentType, contentId);

      expect(mockRedisClient.keys).toHaveBeenCalledTimes(3); // 3 patterns for content
    });
  });

  describe('Cache Warming for Popular Content', () => {
    it('should warm cache with trending posts', async () => {
      const trendingPosts = [
        { id: 'post1', type: 'post' as const, stats: { likes: 100, comments: 50 } },
        { id: 'post2', type: 'post' as const, stats: { likes: 80, comments: 30 } }
      ];

      mockRedisClient.set.mockResolvedValue('OK');

      await cacheService.warmPopularContent(trendingPosts, 3600);

      expect(mockRedisClient.set).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'popular:post:post1',
        JSON.stringify(trendingPosts[0]),
        { EX: 3600 }
      );
    });

    it('should warm user feed cache for active users', async () => {
      const userId = 'user123';
      const feedData = {
        posts: ['post1', 'post2'],
        videos: ['video1'],
        lastUpdated: new Date(),
        preferences: ['recovery', 'community']
      };

      mockRedisClient.set.mockResolvedValue('OK');

      await cacheService.warmUserFeed(userId, feedData, 1800);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `feed:${userId}:warmed`,
        JSON.stringify(feedData),
        { EX: 1800 }
      );
    });
  });

  describe('Performance Monitoring Integration', () => {
    it('should track cache hit/miss rates for different event types', async () => {
      // Track cache hits for feed operations
      mockRedisClient.incr.mockResolvedValue(1);

      await cacheService.incrementHitCounter('feed');
      await cacheService.incrementHitCounter('likes');
      await cacheService.incrementMissCounter('comments');

      expect(mockRedisClient.incr).toHaveBeenCalledWith('cache:hits:feed');
      expect(mockRedisClient.incr).toHaveBeenCalledWith('cache:hits:likes');
      expect(mockRedisClient.incr).toHaveBeenCalledWith('cache:misses:comments');
    });

    it('should generate performance metrics for monitoring', async () => {
      const mockInfo = `keyspace_hits:1000
keyspace_misses:100
used_memory:2097152
connected_clients:5
total_commands_processed:5000`;

      mockRedisClient.info.mockResolvedValue(mockInfo);

      const metrics = await cacheService.getPerformanceMetrics();

      expect(metrics).toEqual({
        hitRate: 90.91,
        missRate: 9.09,
        usedMemoryMB: 2,
        connectedClients: 5,
        totalCommands: 5000,
        timestamp: expect.any(Date)
      });
    });
  });

  describe('Cache Maintenance with WebSocket Events', () => {
    it('should clean up expired event deduplication entries', async () => {
      const expiredEventKeys = ['event:like:post1:user1:old', 'event:comment:post2:user2:old'];
      
      mockRedisClient.keys.mockResolvedValue(expiredEventKeys);
      mockRedisClient.ttl
        .mockResolvedValueOnce(-2) // Expired
        .mockResolvedValueOnce(-2); // Expired
      mockRedisClient.del.mockResolvedValue(2);

      const cleanedCount = await cacheService.cleanExpiredKeys('event:*');

      expect(cleanedCount).toBe(2);
      expect(mockRedisClient.del).toHaveBeenCalledWith(expiredEventKeys);
    });

    it('should provide cache statistics for monitoring dashboard', async () => {
      const mockKeys = ['feed:user1:posts', 'likes:post1:stats', 'trending:content'];
      
      mockRedisClient.keys.mockResolvedValue(mockKeys);
      mockRedisClient.ttl
        .mockResolvedValueOnce(300)  // 5 minutes
        .mockResolvedValueOnce(-1)   // No expiration
        .mockResolvedValueOnce(600); // 10 minutes

      const stats = await cacheService.getCacheStats();

      expect(stats).toEqual({
        totalKeys: 3,
        keysWithExpiration: 2,
        keysWithoutExpiration: 1,
        averageTTL: 450, // (300 + 600) / 2
        timestamp: expect.any(Date)
      });
    });
  });

  describe('Error Handling in Cache Integration', () => {
    it('should handle Redis connection failures gracefully', async () => {
      mockRedisClient.isReady = false;

      // Should not crash when Redis is not available
      const result = await cacheService.get('test:key');
      expect(result).toBeNull();

      const setResult = await cacheService.set('test:key', { data: 'test' });
      expect(setResult).toBe(false);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis not ready'),
        expect.any(Object)
      );
    });

    it('should continue WebSocket operations when cache fails', async () => {
      const error = new Error('Redis connection lost');
      mockRedisClient.get.mockRejectedValue(error);

      // Cache failure should not prevent WebSocket event processing
      const result = await cacheService.get('feed:user123');
      expect(result).toBeNull();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Redis cache get operation failed'),
        expect.any(Object)
      );
    });
  });

  describe('Real-time Cache Updates', () => {
    it('should update cache when new likes are received via WebSocket', async () => {
      const likeData = {
        postId: 'post123',
        userId: 'user456',
        username: 'testuser',
        isLiked: true,
        totalLikes: 6
      };

      // Mock successful cache update
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.incr.mockResolvedValue(6);

      // Cache the like count update
      await cacheService.set(`likes:post:${likeData.postId}:count`, likeData.totalLikes, 300);
      
      // Increment like counter for this post
      await cacheService.incrementHitCounter(`likes:${likeData.postId}`);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `likes:post:${likeData.postId}:count`,
        JSON.stringify(likeData.totalLikes),
        { EX: 300 }
      );
    });

    it('should invalidate relevant caches when content is deleted', async () => {
      const contentType = 'post';
      const contentId = 'post123';
      
      const relatedKeys = [
        `${contentType}:${contentId}:stats`,
        `likes:${contentType}:${contentId}:count`,
        `comments:${contentType}:${contentId}:list`
      ];

      mockRedisClient.keys.mockResolvedValue(relatedKeys);
      mockRedisClient.del.mockResolvedValue(relatedKeys.length);

      await cacheService.invalidateContentCache(contentType, contentId);

      expect(mockRedisClient.keys).toHaveBeenCalledTimes(3);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Content cache invalidated'),
        expect.objectContaining({
          contentType,
          contentId,
          keysDeleted: expect.any(Number)
        })
      );
    });
  });
});