/**
 * Real-Time Caching Strategy Integration Test
 * Comprehensive test of the complete caching implementation for subtask 2.0.1
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
import { cacheConfig } from '../../src/config/cache';
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

describe('Real-Time Caching Strategy (Subtask 2.0.1)', () => {
  let cacheService: RedisCacheService;
  let websocketService: WebSocketEventsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.isReady = true;
    mockRedisClient.isOpen = true;
    
    cacheService = new RedisCacheService(undefined, mockRedisClient);
    websocketService = WebSocketEventsService.getInstance();
    websocketService.setWebSocketServer(mockWebSocketServer);
    
    // Manually set the cache service for testing (access private property)
    (websocketService as any).cacheService = cacheService;
  });

  afterEach(async () => {
    await cacheService.disconnect();
    await websocketService.disconnectCache();
  });

  describe('✅ Requirement: Implement Redis for real-time event caching', () => {
    it('should successfully connect to Redis and initialize caching', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      
      await cacheService.connect();
      
      expect(mockRedisClient.connect).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Redis cache service connected'),
        expect.any(Object)
      );
    });

    it('should handle Redis connection failures gracefully', async () => {
      const error = new Error('Redis connection failed');
      mockRedisClient.connect.mockRejectedValue(error);
      
      await expect(cacheService.connect()).rejects.toThrow('Redis connection failed');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to connect to Redis'),
        expect.any(Object)
      );
    });

    it('should cache real-time events with proper TTL', async () => {
      const eventId = 'like:post123:user456';
      const eventData = { postId: 'post123', userId: 'user456', isLiked: true };
      const ttl = cacheConfig.ttl.events;
      
      mockRedisClient.set.mockResolvedValue('OK');
      
      const result = await cacheService.cacheEvent(eventId, eventData, ttl);
      
      expect(result).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `event:${eventId}`,
        JSON.stringify(eventData),
        { EX: ttl, NX: true }
      );
    });
  });

  describe('✅ Requirement: Add event deduplication mechanisms', () => {
    it('should prevent duplicate like events', async () => {
      const eventId = 'like:post123:user456:timestamp';
      const likeData = {
        postId: 'post123',
        userId: 'user456',
        username: 'testuser',
        isLiked: true,
        totalLikes: 5
      };

      // First event - should succeed
      mockRedisClient.set.mockResolvedValueOnce('OK');
      const firstResult = await cacheService.cacheEvent(eventId, likeData, 60);
      expect(firstResult).toBe(true);

      // Duplicate event - should be prevented
      mockRedisClient.set.mockResolvedValueOnce(null);
      const duplicateResult = await cacheService.cacheEvent(eventId, likeData, 60);
      expect(duplicateResult).toBe(false);
    });

    it('should check for event duplication before processing', async () => {
      const eventId = 'comment:comment123:create';
      
      mockRedisClient.exists.mockResolvedValue(1);
      
      const isDuplicate = await cacheService.isEventDuplicate(eventId);
      
      expect(isDuplicate).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(`event:${eventId}`);
    });

    it('should remove events from deduplication cache when needed', async () => {
      const eventId = 'like:post123:user456';
      
      mockRedisClient.del.mockResolvedValue(1);
      
      await cacheService.removeEventFromDeduplication(eventId);
      
      expect(mockRedisClient.del).toHaveBeenCalledWith(`event:${eventId}`);
    });
  });

  describe('✅ Requirement: Create cache invalidation strategies', () => {
    it('should invalidate cache by pattern', async () => {
      const pattern = 'feed:user123:*';
      const keys = ['feed:user123:posts', 'feed:user123:videos'];
      
      mockRedisClient.keys.mockResolvedValue(keys);
      mockRedisClient.del.mockResolvedValue(2);
      
      await cacheService.invalidatePattern(pattern);
      
      expect(mockRedisClient.keys).toHaveBeenCalledWith(pattern);
      expect(mockRedisClient.del).toHaveBeenCalledWith(keys);
    });

    it('should invalidate user-specific cache on profile changes', async () => {
      const userId = 'user123';
      
      mockRedisClient.keys.mockResolvedValue(['feed:user123:posts']);
      mockRedisClient.del.mockResolvedValue(1);
      
      await cacheService.invalidateUserCache(userId);
      
      expect(mockRedisClient.keys).toHaveBeenCalledTimes(4); // 4 different patterns
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('User cache invalidated'),
        expect.objectContaining({ userId })
      );
    });

    it('should invalidate content-specific cache on content updates', async () => {
      const contentType = 'post';
      const contentId = 'post123';
      
      mockRedisClient.keys.mockResolvedValue([`${contentType}:${contentId}:stats`]);
      mockRedisClient.del.mockResolvedValue(1);
      
      await cacheService.invalidateContentCache(contentType, contentId);
      
      expect(mockRedisClient.keys).toHaveBeenCalledTimes(3); // 3 content-related patterns
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Content cache invalidated'),
        expect.objectContaining({ contentType, contentId })
      );
    });
  });

  describe('✅ Requirement: Implement cache warming for popular content', () => {
    it('should warm cache with popular posts and videos', async () => {
      const popularContent = [
        { id: 'post1', type: 'post' as const, stats: { likes: 100, comments: 50 } },
        { id: 'video1', type: 'video' as const, stats: { likes: 200, views: 1000 } }
      ];
      
      mockRedisClient.set.mockResolvedValue('OK');
      
      await cacheService.warmPopularContent(popularContent, cacheConfig.ttl.popular);
      
      expect(mockRedisClient.set).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'popular:post:post1',
        JSON.stringify(popularContent[0]),
        { EX: cacheConfig.ttl.popular }
      );
    });

    it('should warm user feed cache for active users', async () => {
      const userId = 'user123';
      const feedData = {
        posts: ['post1', 'post2'],
        videos: ['video1'],
        lastUpdated: new Date()
      };
      
      mockRedisClient.set.mockResolvedValue('OK');
      
      await cacheService.warmUserFeed(userId, feedData, cacheConfig.ttl.feeds);
      
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `feed:${userId}:warmed`,
        JSON.stringify(feedData),
        { EX: cacheConfig.ttl.feeds }
      );
    });

    it('should warm trending content cache using sorted sets', async () => {
      const trendingContent = [
        { id: 'post1', score: 95.5, type: 'post' as const },
        { id: 'video1', score: 87.2, type: 'video' as const }
      ];
      
      mockRedisClient.zAdd.mockResolvedValue(2);
      
      await cacheService.warmTrendingContent(trendingContent);
      
      expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
        'trending:content',
        trendingContent.map(item => ({ 
          score: item.score, 
          value: `${item.type}:${item.id}` 
        }))
      );
    });
  });

  describe('✅ Requirement: Add cache performance monitoring', () => {
    it('should collect and report cache performance metrics', async () => {
      const mockInfo = `keyspace_hits:1000
keyspace_misses:100
used_memory:2097152
connected_clients:5
total_commands_processed:10000`;

      mockRedisClient.info.mockResolvedValue(mockInfo);
      
      const metrics = await cacheService.getPerformanceMetrics();
      
      expect(metrics).toEqual({
        hitRate: 90.91, // 1000/(1000+100) * 100
        missRate: 9.09,
        usedMemoryMB: 2, // 2097152 / 1024 / 1024
        connectedClients: 5,
        totalCommands: 10000,
        timestamp: expect.any(Date)
      });
    });

    it('should track cache hit and miss counters by category', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      
      await cacheService.incrementHitCounter('likes');
      await cacheService.incrementMissCounter('feeds');
      
      expect(mockRedisClient.incr).toHaveBeenCalledWith('cache:hits:likes');
      expect(mockRedisClient.incr).toHaveBeenCalledWith('cache:misses:feeds');
    });

    it('should provide comprehensive cache statistics', async () => {
      const mockKeys = ['feed:user1', 'likes:post1', 'trending:content'];
      
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

  describe('✅ Requirement: Create cache cleanup and maintenance', () => {
    it('should clean up expired cache entries', async () => {
      const pattern = 'event:*';
      const expiredKeys = ['event:old1', 'event:old2'];
      
      mockRedisClient.keys.mockResolvedValue(expiredKeys);
      mockRedisClient.ttl
        .mockResolvedValueOnce(-2) // Expired
        .mockResolvedValueOnce(-2); // Expired
      mockRedisClient.del.mockResolvedValue(2);
      
      const cleanedCount = await cacheService.cleanExpiredKeys(pattern);
      
      expect(cleanedCount).toBe(2);
      expect(mockRedisClient.del).toHaveBeenCalledWith(expiredKeys);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Expired keys cleaned'),
        expect.objectContaining({ cleanedCount: 2 })
      );
    });

    it('should perform scheduled cache maintenance', async () => {
      mockRedisClient.keys
        .mockResolvedValueOnce(['event:expired1'])  // event:* pattern
        .mockResolvedValueOnce(['feed:expired1']);  // feed:* pattern
      mockRedisClient.ttl
        .mockResolvedValueOnce(-2)  // Expired event
        .mockResolvedValueOnce(-2); // Expired feed
      mockRedisClient.del.mockResolvedValue(1);
      
      await websocketService.performCacheMaintenance();
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cache maintenance completed'),
        expect.any(Object)
      );
    });

    it('should handle cache flush operations safely', async () => {
      mockRedisClient.flushAll.mockResolvedValue('OK');
      
      await cacheService.flushAll();
      
      expect(mockRedisClient.flushAll).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Flushing all Redis cache'),
        expect.any(Object)
      );
    });
  });

  describe('🔧 Integration: WebSocket Events with Cache', () => {
    it('should integrate cache deduplication with like events', async () => {
      const contentType = 'post';
      const contentId = 'post123';
      const authorId = 'author456';
      const likerId = 'user789';
      const likerUsername = 'testliker';
      const isLiked = true;
      const totalLikes = 5;

      // Mock cache service methods
      mockRedisClient.set.mockResolvedValue('OK'); // Event cached and like count cached
      mockRedisClient.incr.mockResolvedValue(1); // Hit counter
      
      await websocketService.emitLikeEvent(
        contentType,
        contentId,
        authorId,
        likerId,
        likerUsername,
        isLiked,
        totalLikes
      );

      // Should emit WebSocket event
      expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith(
        authorId,
        'post:liked',
        expect.any(Object)
      );
      
      // Should cache event and hit counter
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('event:like:'),
        expect.any(String),
        { EX: 60, NX: true }
      );
      expect(mockRedisClient.incr).toHaveBeenCalledWith('cache:hits:likes');
    });

    it('should integrate cache warming with WebSocket service', async () => {
      const popularContent = [
        { id: 'post1', type: 'post' as const, stats: { likes: 100 } }
      ];
      
      mockRedisClient.set.mockResolvedValue('OK');
      
      await websocketService.warmPopularContentCache(popularContent);
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Popular content cache warmed'),
        expect.objectContaining({ contentCount: 1 })
      );
    });
  });

  describe('🚨 Error Handling and Resilience', () => {
    it('should continue operations when Redis is unavailable', async () => {
      mockRedisClient.isReady = false;
      
      // Cache operations should fail gracefully
      const result = await cacheService.get('test:key');
      expect(result).toBeNull();
      
      const setResult = await cacheService.set('test:key', { data: 'test' });
      expect(setResult).toBe(false);
      
      // WebSocket operations should continue
      await websocketService.emitLikeEvent(
        'post',
        'post123',
        'author456',
        'user789',
        'testuser',
        true,
        5
      );
      
      expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalled();
    });

    it('should handle Redis operation errors without crashing', async () => {
      const error = new Error('Redis operation failed');
      mockRedisClient.get.mockRejectedValue(error);
      
      const result = await cacheService.get('failing:key');
      
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Redis cache get operation failed'),
        expect.any(Object)
      );
    });
  });

  describe('📊 Cache Configuration', () => {
    it('should use proper TTL values from configuration', () => {
      expect(cacheConfig.ttl.events).toBe(60);
      expect(cacheConfig.ttl.likes).toBe(300);
      expect(cacheConfig.ttl.feeds).toBe(1800);
      expect(cacheConfig.ttl.popular).toBe(3600);
      expect(cacheConfig.redis.connectTimeout).toBe(10000);
    });

    it('should have proper maintenance configuration', () => {
      expect(cacheConfig.maintenance.cleanupInterval).toBe(300000); // 5 minutes
      expect(cacheConfig.maintenance.expiredKeyPattern).toEqual(['event:*', 'feed:*', 'temp:*']);
      expect(cacheConfig.monitoring.hitRateThreshold).toBe(80);
    });
  });
});