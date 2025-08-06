/**
 * Redis Cache Service
 * Real-time caching strategy implementation with Redis
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  usedMemoryMB: number;
  connectedClients: number;
  totalCommands: number;
  timestamp: Date;
}

export interface CacheStats {
  totalKeys: number;
  keysWithExpiration: number;
  keysWithoutExpiration: number;
  averageTTL: number;
  timestamp: Date;
}

export interface TrendingContentItem {
  id: string;
  type: 'post' | 'video';
  score: number;
}

export interface PopularContentItem {
  id: string;
  type: 'post' | 'video';
  stats: Record<string, any>;
}

export class RedisCacheService {
  private client: RedisClientType;
  private isConnected = false;

  constructor(redisUrl?: string, mockClient?: any) {
    // Allow dependency injection for testing
    if (mockClient) {
      this.client = mockClient;
      // Skip event listeners for mocked client
      return;
    }
    
    this.client = createClient({
      url: redisUrl || process.env['REDIS_URL'] || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500),
        connectTimeout: 10000
      }
    });

    // Event listeners for connection monitoring
    this.client.on('connect', () => {
      logger.info('Redis client connecting...', { component: 'RedisCacheService' });
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      logger.info('Redis client ready', { component: 'RedisCacheService' });
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error', {
        component: 'RedisCacheService',
        error: error.message,
        stack: error.stack
      });
      this.isConnected = false;
    });

    this.client.on('end', () => {
      this.isConnected = false;
      logger.info('Redis client disconnected', { component: 'RedisCacheService' });
    });
  }

  /**
   * Connect to Redis
   */
  public async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.isConnected = true;
      
      logger.info('Redis cache service connected successfully', {
        component: 'RedisCacheService',
        url: this.client.options?.url || 'default'
      });
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to connect to Redis', {
        component: 'RedisCacheService',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.isConnected || this.client) {
        await this.client.disconnect();
        this.isConnected = false;
      }
      
      logger.info('Redis cache service disconnected successfully', {
        component: 'RedisCacheService'
      });
    } catch (error) {
      logger.error('Failed to disconnect from Redis', {
        component: 'RedisCacheService',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Check if Redis is ready for operations
   */
  public isReady(): boolean {
    return this.client.isReady;
  }

  /**
   * Basic cache operations
   */

  /**
   * Set a value in cache with optional expiration
   */
  public async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    try {
      if (!this.isReady()) {
        logger.warn('Redis not ready for cache set operation', {
          component: 'RedisCacheService',
          key,
          isReady: this.isReady(),
          isOpen: this.client.isOpen
        });
        return false;
      }

      const serializedValue = JSON.stringify(value);
      const options = ttlSeconds ? { EX: ttlSeconds } : undefined;
      
      const result = await this.client.set(key, serializedValue, options);
      
      if (result === 'OK') {
        logger.debug('Cache set successful', {
          component: 'RedisCacheService',
          key,
          ttl: ttlSeconds
        });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Redis cache set operation failed', {
        component: 'RedisCacheService',
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return false;
    }
  }

  /**
   * Get a value from cache
   */
  public async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.isReady()) {
        logger.warn('Redis not ready for cache operation', {
          component: 'RedisCacheService',
          operation: 'get',
          key,
          isReady: this.isReady(),
          isOpen: this.client.isOpen
        });
        return null;
      }

      const value = await this.client.get(key);
      
      if (value === null) {
        return null;
      }

      try {
        const parsedValue = JSON.parse(value) as T;
        logger.debug('Cache get successful', {
          component: 'RedisCacheService',
          key
        });
        return parsedValue;
      } catch (parseError) {
        logger.error('Failed to parse cached value', {
          component: 'RedisCacheService',
          key,
          error: parseError instanceof Error ? parseError.message : 'Parse error'
        });
        return null;
      }
    } catch (error) {
      logger.error('Redis cache get operation failed', {
        component: 'RedisCacheService',
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return null;
    }
  }

  /**
   * Delete a value from cache
   */
  public async delete(key: string): Promise<boolean> {
    try {
      if (!this.isReady()) {
        logger.warn('Redis not ready for cache delete operation', {
          component: 'RedisCacheService',
          key
        });
        return false;
      }

      const result = await this.client.del(key);
      
      logger.debug('Cache delete operation completed', {
        component: 'RedisCacheService',
        key,
        deleted: result > 0
      });
      
      return result > 0;
    } catch (error) {
      logger.error('Redis cache delete operation failed', {
        component: 'RedisCacheService',
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Event Deduplication
   */

  /**
   * Cache an event for deduplication (uses NX flag to only set if not exists)
   */
  public async cacheEvent<T>(eventId: string, eventData: T, ttlSeconds: number = 60): Promise<boolean> {
    try {
      if (!this.isReady()) {
        logger.warn('Redis not ready for event caching', {
          component: 'RedisCacheService',
          eventId
        });
        return false;
      }

      const key = `event:${eventId}`;
      const serializedData = JSON.stringify(eventData);
      
      // Use NX flag to only set if key doesn't exist (prevents duplicates)
      const result = await this.client.set(key, serializedData, { EX: ttlSeconds, NX: true });
      
      const success = result === 'OK';
      
      logger.debug('Event caching result', {
        component: 'RedisCacheService',
        eventId,
        success,
        ttl: ttlSeconds
      });
      
      return success;
    } catch (error) {
      logger.error('Failed to cache event', {
        component: 'RedisCacheService',
        eventId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Check if an event is a duplicate
   */
  public async isEventDuplicate(eventId: string): Promise<boolean> {
    try {
      if (!this.isReady()) {
        return false;
      }

      const key = `event:${eventId}`;
      const exists = await this.client.exists(key);
      
      return exists > 0;
    } catch (error) {
      logger.error('Failed to check event duplication', {
        component: 'RedisCacheService',
        eventId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Remove event from deduplication cache
   */
  public async removeEventFromDeduplication(eventId: string): Promise<void> {
    try {
      if (!this.isReady()) {
        return;
      }

      const key = `event:${eventId}`;
      await this.client.del(key);
      
      logger.debug('Event removed from deduplication cache', {
        component: 'RedisCacheService',
        eventId
      });
    } catch (error) {
      logger.error('Failed to remove event from deduplication', {
        component: 'RedisCacheService',
        eventId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Cache Invalidation Strategies
   */

  /**
   * Invalidate cache by pattern
   */
  public async invalidatePattern(pattern: string): Promise<void> {
    try {
      if (!this.isReady()) {
        return;
      }

      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        await this.client.del(keys as [string, ...string[]]);
        
        logger.info('Cache invalidated by pattern', {
          component: 'RedisCacheService',
          pattern,
          keysDeleted: keys.length
        });
      }
    } catch (error) {
      logger.error('Failed to invalidate cache by pattern', {
        component: 'RedisCacheService',
        pattern,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Invalidate user-specific cache
   */
  public async invalidateUserCache(userId: string): Promise<void> {
    try {
      if (!this.isReady()) {
        return;
      }

      const patterns = [
        `feed:${userId}:*`,
        `timeline:${userId}:*`,
        `recommendations:${userId}:*`,
        `presence:${userId}:*`
      ];

      let totalDeleted = 0;
      
      for (const pattern of patterns) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(keys as [string, ...string[]]);
          totalDeleted += keys.length;
        }
      }

      logger.info('User cache invalidated', {
        component: 'RedisCacheService',
        userId,
        keysDeleted: totalDeleted
      });
    } catch (error) {
      logger.error('Failed to invalidate user cache', {
        component: 'RedisCacheService',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Invalidate content-specific cache
   */
  public async invalidateContentCache(contentType: 'post' | 'video', contentId: string): Promise<void> {
    try {
      if (!this.isReady()) {
        return;
      }

      const patterns = [
        `${contentType}:${contentId}:*`,
        `likes:${contentType}:${contentId}:*`,
        `comments:${contentType}:${contentId}:*`
      ];

      let totalDeleted = 0;
      
      for (const pattern of patterns) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(keys as [string, ...string[]]);
          totalDeleted += keys.length;
        }
      }

      logger.info('Content cache invalidated', {
        component: 'RedisCacheService',
        contentType,
        contentId,
        keysDeleted: totalDeleted
      });
    } catch (error) {
      logger.error('Failed to invalidate content cache', {
        component: 'RedisCacheService',
        contentType,
        contentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Cache Warming for Popular Content
   */

  /**
   * Warm popular content cache
   */
  public async warmPopularContent(
    contentItems: PopularContentItem[],
    ttlSeconds: number = 3600
  ): Promise<void> {
    try {
      if (!this.isReady()) {
        return;
      }

      for (const item of contentItems) {
        const key = `popular:${item.type}:${item.id}`;
        await this.client.set(key, JSON.stringify(item), { EX: ttlSeconds });
      }

      logger.info('Popular content cache warmed', {
        component: 'RedisCacheService',
        itemCount: contentItems.length,
        ttl: ttlSeconds
      });
    } catch (error) {
      logger.error('Failed to warm popular content cache', {
        component: 'RedisCacheService',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Warm user feed cache
   */
  public async warmUserFeed(
    userId: string,
    feedData: any,
    ttlSeconds: number = 1800
  ): Promise<void> {
    try {
      if (!this.isReady()) {
        return;
      }

      const key = `feed:${userId}:warmed`;
      await this.client.set(key, JSON.stringify(feedData), { EX: ttlSeconds });

      logger.info('User feed cache warmed', {
        component: 'RedisCacheService',
        userId,
        ttl: ttlSeconds
      });
    } catch (error) {
      logger.error('Failed to warm user feed cache', {
        component: 'RedisCacheService',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Warm trending content cache using sorted sets
   */
  public async warmTrendingContent(trendingContent: TrendingContentItem[]): Promise<void> {
    try {
      if (!this.isReady()) {
        return;
      }

      const key = 'trending:content';
      const members = trendingContent.map(item => ({
        score: item.score,
        value: `${item.type}:${item.id}`
      }));

      await this.client.zAdd(key, members);

      logger.info('Trending content cache warmed', {
        component: 'RedisCacheService',
        itemCount: trendingContent.length
      });
    } catch (error) {
      logger.error('Failed to warm trending content cache', {
        component: 'RedisCacheService',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Performance Monitoring
   */

  /**
   * Get cache performance metrics
   */
  public async getPerformanceMetrics(): Promise<CacheMetrics> {
    try {
      if (!this.isReady()) {
        return {
          hitRate: 0,
          missRate: 0,
          usedMemoryMB: 0,
          connectedClients: 0,
          totalCommands: 0,
          timestamp: new Date()
        };
      }

      const info = await this.client.info('stats memory clients');
      const stats = this.parseRedisInfo(info);

      const hits = parseInt(stats['keyspace_hits'] || '0');
      const misses = parseInt(stats['keyspace_misses'] || '0');
      const total = hits + misses;
      
      const hitRate = total > 0 ? (hits / total) * 100 : 0;
      const missRate = total > 0 ? (misses / total) * 100 : 0;

      return {
        hitRate: Math.round(hitRate * 100) / 100,
        missRate: Math.round(missRate * 100) / 100,
        usedMemoryMB: Math.round((parseInt(stats['used_memory'] || '0') / 1024 / 1024) * 100) / 100,
        connectedClients: parseInt(stats['connected_clients'] || '0'),
        totalCommands: parseInt(stats['total_commands_processed'] || '0'),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to get performance metrics', {
        component: 'RedisCacheService',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        hitRate: 0,
        missRate: 0,
        usedMemoryMB: 0,
        connectedClients: 0,
        totalCommands: 0,
        timestamp: new Date()
      };
    }
  }

  /**
   * Parse Redis INFO command output
   */
  private parseRedisInfo(info: string): Record<string, string> {
    const stats: Record<string, string> = {};
    const lines = info.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, value] = trimmed.split(':');
        if (key && value) {
          stats[key] = value;
        }
      }
    }
    
    return stats;
  }

  /**
   * Increment cache hit counter for monitoring
   */
  public async incrementHitCounter(category: string): Promise<void> {
    try {
      if (!this.isReady()) {
        return;
      }

      await this.client.incr(`cache:hits:${category}`);
    } catch (error) {
      logger.error('Failed to increment hit counter', {
        component: 'RedisCacheService',
        category,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Increment cache miss counter for monitoring
   */
  public async incrementMissCounter(category: string): Promise<void> {
    try {
      if (!this.isReady()) {
        return;
      }

      await this.client.incr(`cache:misses:${category}`);
    } catch (error) {
      logger.error('Failed to increment miss counter', {
        component: 'RedisCacheService',
        category,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Cache Cleanup and Maintenance
   */

  /**
   * Clean expired keys matching a pattern
   */
  public async cleanExpiredKeys(pattern: string = '*'): Promise<number> {
    try {
      if (!this.isReady()) {
        return 0;
      }

      const keys = await this.client.keys(pattern);
      const expiredKeys: string[] = [];

      // Check TTL for each key
      for (const key of keys) {
        const ttl = await this.client.ttl(key);
        if (ttl === -2) { // Key expired or doesn't exist
          expiredKeys.push(key);
        }
      }

      if (expiredKeys.length > 0) {
        await this.client.del(expiredKeys as [string, ...string[]]);
      }

      logger.info('Expired keys cleaned', {
        component: 'RedisCacheService',
        pattern,
        cleanedCount: expiredKeys.length
      });

      return expiredKeys.length;
    } catch (error) {
      logger.error('Failed to clean expired keys', {
        component: 'RedisCacheService',
        pattern,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<CacheStats> {
    try {
      if (!this.isReady()) {
        return {
          totalKeys: 0,
          keysWithExpiration: 0,
          keysWithoutExpiration: 0,
          averageTTL: 0,
          timestamp: new Date()
        };
      }

      const keys = await this.client.keys('*');
      const totalKeys = keys.length;
      let keysWithExpiration = 0;
      let keysWithoutExpiration = 0;
      let totalTTL = 0;

      for (const key of keys) {
        const ttl = await this.client.ttl(key);
        if (ttl === -1) {
          keysWithoutExpiration++;
        } else if (ttl > 0) {
          keysWithExpiration++;
          totalTTL += ttl;
        }
      }

      const averageTTL = keysWithExpiration > 0 ? totalTTL / keysWithExpiration : 0;

      return {
        totalKeys,
        keysWithExpiration,
        keysWithoutExpiration,
        averageTTL: Math.round(averageTTL),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to get cache statistics', {
        component: 'RedisCacheService',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        totalKeys: 0,
        keysWithExpiration: 0,
        keysWithoutExpiration: 0,
        averageTTL: 0,
        timestamp: new Date()
      };
    }
  }

  /**
   * Flush all cache (use with caution)
   */
  public async flushAll(): Promise<void> {
    try {
      if (!this.isReady()) {
        return;
      }

      logger.warn('Flushing all Redis cache - this will remove all cached data', {
        component: 'RedisCacheService'
      });
      
      await this.client.flushAll();
      
      logger.info('All Redis cache flushed successfully', {
        component: 'RedisCacheService'
      });
    } catch (error) {
      logger.error('Failed to flush all cache', {
        component: 'RedisCacheService',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

// Export singleton instance
let redisCacheInstance: RedisCacheService | null = null;

export const getRedisCacheService = (): RedisCacheService => {
  if (!redisCacheInstance) {
    redisCacheInstance = new RedisCacheService();
  }
  return redisCacheInstance;
};