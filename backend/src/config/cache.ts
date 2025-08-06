/**
 * Redis Cache Configuration
 * Configuration settings for Redis-based real-time caching
 */

export interface CacheConfig {
  redis: {
    url: string;
    host: string;
    port: number;
    password?: string;
    db: number;
    connectTimeout: number;
    lazyConnect: boolean;
    retryDelayOnFailover: number;
    maxRetriesPerRequest: number;
  };
  ttl: {
    events: number;          // Event deduplication TTL (seconds)
    likes: number;           // Like counts cache TTL (seconds)
    comments: number;        // Comment data cache TTL (seconds)
    feeds: number;          // User feeds cache TTL (seconds)
    popular: number;        // Popular content cache TTL (seconds)
    trending: number;       // Trending content cache TTL (seconds)
    recommendations: number; // Recommendations cache TTL (seconds)
  };
  maintenance: {
    cleanupInterval: number; // Cache cleanup interval (milliseconds)
    maxKeysPerCleanup: number;
    expiredKeyPattern: string[];
  };
  monitoring: {
    metricsInterval: number; // Performance metrics collection interval (ms)
    hitRateThreshold: number; // Alert threshold for hit rate (percentage)
    memoryThreshold: number;  // Alert threshold for memory usage (MB)
  };
}

const defaultConfig: CacheConfig = {
  redis: {
    url: process.env['REDIS_URL'] || 'redis://localhost:6379',
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379'),
    ...(process.env['REDIS_PASSWORD'] && { password: process.env['REDIS_PASSWORD'] }),
    db: parseInt(process.env['REDIS_DB'] || '0'),
    connectTimeout: 10000,
    lazyConnect: true,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  },
  ttl: {
    events: parseInt(process.env['CACHE_TTL_EVENTS'] || '60'),          // 1 minute
    likes: parseInt(process.env['CACHE_TTL_LIKES'] || '300'),           // 5 minutes
    comments: parseInt(process.env['CACHE_TTL_COMMENTS'] || '600'),     // 10 minutes
    feeds: parseInt(process.env['CACHE_TTL_FEEDS'] || '1800'),          // 30 minutes
    popular: parseInt(process.env['CACHE_TTL_POPULAR'] || '3600'),      // 1 hour
    trending: parseInt(process.env['CACHE_TTL_TRENDING'] || '1800'),    // 30 minutes
    recommendations: parseInt(process.env['CACHE_TTL_RECOMMENDATIONS'] || '7200') // 2 hours
  },
  maintenance: {
    cleanupInterval: parseInt(process.env['CACHE_CLEANUP_INTERVAL'] || '300000'), // 5 minutes
    maxKeysPerCleanup: parseInt(process.env['CACHE_MAX_KEYS_CLEANUP'] || '1000'),
    expiredKeyPattern: ['event:*', 'feed:*', 'temp:*']
  },
  monitoring: {
    metricsInterval: parseInt(process.env['CACHE_METRICS_INTERVAL'] || '60000'), // 1 minute
    hitRateThreshold: parseInt(process.env['CACHE_HIT_RATE_THRESHOLD'] || '80'), // 80%
    memoryThreshold: parseInt(process.env['CACHE_MEMORY_THRESHOLD'] || '500')    // 500 MB
  }
};

export const cacheConfig = defaultConfig;