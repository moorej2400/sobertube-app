/**
 * Redis Cache Service Unit Tests
 * Testing real-time caching strategy with Redis
 */

import { RedisCacheService } from '../../src/services/redisCacheService';
import { logger } from '../../src/utils/logger';

// Mock Redis client
const mockRedisClient = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  isOpen: false,
  isReady: false,
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

// Mock Redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient)
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('RedisCacheService', () => {
  let cacheService: RedisCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.isReady = true;
    mockRedisClient.isOpen = true;
    cacheService = new RedisCacheService(undefined, mockRedisClient);
  });

  afterEach(async () => {
    await cacheService.disconnect();
  });

  describe('Connection Management', () => {
    it('should connect to Redis successfully', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      
      await cacheService.connect();
      
      expect(mockRedisClient.connect).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Redis cache service connected'),
        expect.any(Object)
      );
    });

    it('should handle connection errors gracefully', async () => {
      const error = new Error('Connection failed');
      mockRedisClient.connect.mockRejectedValue(error);
      
      await expect(cacheService.connect()).rejects.toThrow('Connection failed');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to connect to Redis'),
        expect.any(Object)
      );
    });

    it('should disconnect from Redis', async () => {
      mockRedisClient.disconnect.mockResolvedValue(undefined);
      
      await cacheService.disconnect();
      
      expect(mockRedisClient.disconnect).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Redis cache service disconnected'),
        expect.any(Object)
      );
    });

    it('should check if Redis is ready', () => {
      mockRedisClient.isReady = true;
      expect(cacheService.isReady()).toBe(true);
      
      mockRedisClient.isReady = false;
      expect(cacheService.isReady()).toBe(false);
    });
  });

  describe('Basic Cache Operations', () => {
    it('should set and get cache values', async () => {
      const key = 'test:key';
      const value = { id: '123', name: 'test' };
      const serializedValue = JSON.stringify(value);
      
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.get.mockResolvedValue(serializedValue);
      
      await cacheService.set(key, value, 300);
      const result = await cacheService.get(key);
      
      expect(mockRedisClient.set).toHaveBeenCalledWith(key, serializedValue, { EX: 300 });
      expect(mockRedisClient.get).toHaveBeenCalledWith(key);
      expect(result).toEqual(value);
    });

    it('should return null for non-existent keys', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const result = await cacheService.get('non:existent');
      
      expect(result).toBeNull();
    });

    it('should delete cache values', async () => {
      mockRedisClient.del.mockResolvedValue(1);
      
      const result = await cacheService.delete('test:key');
      
      expect(mockRedisClient.del).toHaveBeenCalledWith('test:key');
      expect(result).toBe(true);
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockRedisClient.get.mockResolvedValue('invalid-json');
      
      const result = await cacheService.get('invalid:key');
      
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse cached value'),
        expect.any(Object)
      );
    });
  });

  describe('Event Deduplication', () => {
    it('should cache event and prevent duplicates', async () => {
      const eventId = 'like:post123:user456';
      const eventData = { postId: 'post123', userId: 'user456', action: 'like' };
      
      mockRedisClient.set.mockResolvedValue('OK');
      
      const result = await cacheService.cacheEvent(eventId, eventData, 60);
      
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `event:${eventId}`,
        JSON.stringify(eventData),
        { EX: 60, NX: true }
      );
      expect(result).toBe(true);
    });

    it('should return false for duplicate events', async () => {
      const eventId = 'like:post123:user456';
      const eventData = { postId: 'post123', userId: 'user456', action: 'like' };
      
      mockRedisClient.set.mockResolvedValue(null); // Key already exists
      
      const result = await cacheService.cacheEvent(eventId, eventData, 60);
      
      expect(result).toBe(false);
    });

    it('should check if event is duplicate', async () => {
      const eventId = 'like:post123:user456';
      
      mockRedisClient.exists.mockResolvedValue(1);
      
      const isDuplicate = await cacheService.isEventDuplicate(eventId);
      
      expect(mockRedisClient.exists).toHaveBeenCalledWith(`event:${eventId}`);
      expect(isDuplicate).toBe(true);
    });

    it('should remove event from deduplication cache', async () => {
      const eventId = 'like:post123:user456';
      
      mockRedisClient.del.mockResolvedValue(1);
      
      await cacheService.removeEventFromDeduplication(eventId);
      
      expect(mockRedisClient.del).toHaveBeenCalledWith(`event:${eventId}`);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache by pattern', async () => {
      const pattern = 'feed:user123:*';
      const keys = ['feed:user123:posts', 'feed:user123:videos'];
      
      mockRedisClient.keys.mockResolvedValue(keys);
      mockRedisClient.del.mockResolvedValue(2);
      
      await cacheService.invalidatePattern(pattern);
      
      expect(mockRedisClient.keys).toHaveBeenCalledWith(pattern);
      expect(mockRedisClient.del).toHaveBeenCalledWith(keys);
    });

    it('should invalidate user-specific cache', async () => {
      const userId = 'user123';
      const patterns = [
        `feed:${userId}:*`,
        `timeline:${userId}:*`,
        `recommendations:${userId}:*`,
        `presence:${userId}:*`
      ];
      
      mockRedisClient.keys.mockResolvedValue(['feed:user123:posts']);
      mockRedisClient.del.mockResolvedValue(1);
      
      await cacheService.invalidateUserCache(userId);
      
      // Should call keys for each pattern
      expect(mockRedisClient.keys).toHaveBeenCalledTimes(4);
      patterns.forEach(pattern => {
        expect(mockRedisClient.keys).toHaveBeenCalledWith(pattern);
      });
    });

    it('should invalidate content-specific cache', async () => {
      const contentType = 'post';
      const contentId = 'post123';
      const patterns = [
        `${contentType}:${contentId}:*`,
        `likes:${contentType}:${contentId}:*`,
        `comments:${contentType}:${contentId}:*`
      ];
      
      mockRedisClient.keys.mockResolvedValue([`${contentType}:${contentId}:stats`]);
      mockRedisClient.del.mockResolvedValue(1);
      
      await cacheService.invalidateContentCache(contentType, contentId);
      
      expect(mockRedisClient.keys).toHaveBeenCalledTimes(3);
      patterns.forEach(pattern => {
        expect(mockRedisClient.keys).toHaveBeenCalledWith(pattern);
      });
    });
  });

  describe('Cache Warming', () => {
    it('should warm popular content cache', async () => {
      const contentItems = [
        { id: 'post1', type: 'post' as const, stats: { likes: 100, comments: 50 } },
        { id: 'video1', type: 'video' as const, stats: { likes: 200, views: 1000 } }
      ];
      
      mockRedisClient.set.mockResolvedValue('OK');
      
      await cacheService.warmPopularContent(contentItems);
      
      expect(mockRedisClient.set).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'popular:post:post1',
        JSON.stringify(contentItems[0]),
        { EX: 3600 } // 1 hour default
      );
    });

    it('should warm user feed cache', async () => {
      const userId = 'user123';
      const feedData = {
        posts: ['post1', 'post2'],
        videos: ['video1'],
        lastUpdated: new Date()
      };
      
      mockRedisClient.set.mockResolvedValue('OK');
      
      await cacheService.warmUserFeed(userId, feedData, 1800);
      
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `feed:${userId}:warmed`,
        JSON.stringify(feedData),
        { EX: 1800 }
      );
    });

    it('should warm trending content cache', async () => {
      const trendingContent = [
        { id: 'post1', score: 95.5, type: 'post' as const },
        { id: 'video1', score: 87.2, type: 'video' as const }
      ];
      
      mockRedisClient.zAdd.mockResolvedValue(2);
      
      await cacheService.warmTrendingContent(trendingContent);
      
      expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
        'trending:content',
        trendingContent.map(item => ({ score: item.score, value: `${item.type}:${item.id}` }))
      );
    });
  });

  describe('Performance Monitoring', () => {
    it('should get cache performance metrics', async () => {
      const mockStats = {
        keyspace_hits: '1000',
        keyspace_misses: '100',
        used_memory: '1048576',
        connected_clients: '5',
        total_commands_processed: '5000'
      };
      
      mockRedisClient.info = jest.fn().mockResolvedValue(
        Object.entries(mockStats).map(([key, value]) => `${key}:${value}`).join('\n')
      );
      
      const metrics = await cacheService.getPerformanceMetrics();
      
      expect(metrics).toEqual({
        hitRate: 90.91, // 1000/(1000+100) * 100
        missRate: 9.09,
        usedMemoryMB: 1, // 1048576 / 1024 / 1024
        connectedClients: 5,
        totalCommands: 5000,
        timestamp: expect.any(Date)
      });
    });

    it('should increment cache hit counter', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      
      await cacheService.incrementHitCounter('feed');
      
      expect(mockRedisClient.incr).toHaveBeenCalledWith('cache:hits:feed');
    });

    it('should increment cache miss counter', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      
      await cacheService.incrementMissCounter('feed');
      
      expect(mockRedisClient.incr).toHaveBeenCalledWith('cache:misses:feed');
    });
  });

  describe('Cache Maintenance', () => {
    it('should clean expired keys', async () => {
      mockRedisClient.keys.mockResolvedValue(['expired:key1', 'expired:key2']);
      mockRedisClient.ttl.mockResolvedValueOnce(-2).mockResolvedValueOnce(-2); // Both expired
      mockRedisClient.del.mockResolvedValue(2);
      
      const cleanedCount = await cacheService.cleanExpiredKeys('expired:*');
      
      expect(mockRedisClient.keys).toHaveBeenCalledWith('expired:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith(['expired:key1', 'expired:key2']);
      expect(cleanedCount).toBe(2);
    });

    it('should get cache statistics', async () => {
      mockRedisClient.keys.mockResolvedValue(['key1', 'key2', 'key3']);
      mockRedisClient.ttl
        .mockResolvedValueOnce(300)
        .mockResolvedValueOnce(-1) // No expiration
        .mockResolvedValueOnce(600);
      
      const stats = await cacheService.getCacheStats();
      
      expect(stats).toEqual({
        totalKeys: 3,
        keysWithExpiration: 2,
        keysWithoutExpiration: 1,
        averageTTL: 450, // (300 + 600) / 2
        timestamp: expect.any(Date)
      });
    });

    it('should flush all cache', async () => {
      mockRedisClient.flushAll.mockResolvedValue('OK');
      
      await cacheService.flushAll();
      
      expect(mockRedisClient.flushAll).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Flushing all Redis cache'),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors in operations', async () => {
      mockRedisClient.isReady = false;
      
      const result = await cacheService.get('test:key');
      
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis not ready for cache operation'),
        expect.any(Object)
      );
    });

    it('should handle Redis operation errors gracefully', async () => {
      const error = new Error('Redis operation failed');
      mockRedisClient.get.mockRejectedValue(error);
      
      const result = await cacheService.get('test:key');
      
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Redis cache get operation failed'),
        expect.any(Object)
      );
    });

    it('should handle network errors in set operations', async () => {
      const error = new Error('Network error');
      mockRedisClient.set.mockRejectedValue(error);
      
      const result = await cacheService.set('test:key', { data: 'test' });
      
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Redis cache set operation failed'),
        expect.any(Object)
      );
    });
  });
});