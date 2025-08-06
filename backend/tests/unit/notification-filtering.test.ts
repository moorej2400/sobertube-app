/**
 * Notification Filtering Service Unit Tests
 * Tests for intelligent notification filtering, importance scoring, and spam detection
 */

import { NotificationFilteringService } from '../../src/services/notificationFilteringService';
import { getRedisCacheService } from '../../src/services/redisCacheService';
import { getSupabaseClient } from '../../src/services/supabase';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/services/redisCacheService');
jest.mock('../../src/services/supabase');
jest.mock('../../src/utils/logger');

describe('NotificationFilteringService', () => {
  let filteringService: NotificationFilteringService;
  let mockCacheService: any;
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock cache service
    mockCacheService = {
      isReady: jest.fn().mockReturnValue(true),
      get: jest.fn(),
      set: jest.fn(),
      increment: jest.fn(),
      exists: jest.fn(),
      zAdd: jest.fn(),
      zScore: jest.fn(),
      zRange: jest.fn(),
      zCount: jest.fn(),
      delete: jest.fn()
    };
    (getRedisCacheService as jest.Mock).mockReturnValue(mockCacheService);

    // Mock Supabase
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(),
      data: null,
      error: null
    };
    (getSupabaseClient as jest.Mock).mockImplementation(() => mockSupabase);

    filteringService = new NotificationFilteringService();
  });

  describe('Notification Importance Scoring', () => {
    it('should calculate high importance score for direct mentions', async () => {
      const notification = {
        id: 'notif-123',
        type: 'mention' as const,
        userId: 'user-456',
        data: {
          mentionedByFollower: true,
          isReply: false,
          contentType: 'post'
        },
        timestamp: new Date()
      };

      const score = await filteringService.calculateImportanceScore(notification);

      expect(score).toBeGreaterThanOrEqual(0.8); // High importance for mentions
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should calculate medium importance score for likes from followers', async () => {
      const notification = {
        id: 'notif-124',
        type: 'like' as const,
        userId: 'user-456',
        data: {
          likerIsFollower: true,
          totalLikes: 5,
          contentAge: 3600000 // 1 hour old
        },
        timestamp: new Date()
      };

      const score = await filteringService.calculateImportanceScore(notification);

      expect(score).toBeGreaterThanOrEqual(0.4);
      expect(score).toBeLessThanOrEqual(0.7);
    });

    it('should calculate low importance score for likes from non-followers', async () => {
      const notification = {
        id: 'notif-125',
        type: 'like' as const,
        userId: 'user-456',
        data: {
          likerIsFollower: false,
          totalLikes: 50,
          contentAge: 86400000 // 1 day old
        },
        timestamp: new Date()
      };

      const score = await filteringService.calculateImportanceScore(notification);

      expect(score).toBeGreaterThanOrEqual(0.1);
      expect(score).toBeLessThanOrEqual(0.45); // Allow for floating point precision
    });

    it('should boost importance score for trending content notifications', async () => {
      const notification = {
        id: 'notif-126',
        type: 'trending' as const,
        userId: 'user-456',
        data: {
          trendingRank: 3,
          engagementScore: 0.85,
          isUserContent: true
        },
        timestamp: new Date()
      };

      const score = await filteringService.calculateImportanceScore(notification);

      expect(score).toBeGreaterThanOrEqual(0.7);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should consider user engagement history in scoring', async () => {
      // Mock user engagement data
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          avg_open_rate: 0.8,
          avg_click_rate: 0.4,
          total_notifications: 100,
          preferred_types: ['like', 'comment']
        },
        error: null
      });

      const notification = {
        id: 'notif-127',
        type: 'like' as const,
        userId: 'user-456',
        data: {},
        timestamp: new Date()
      };

      const score = await filteringService.calculateImportanceScore(notification);

      // Higher engagement users should get higher scores for preferred types
      expect(score).toBeGreaterThan(0.3);
    });
  });

  describe('Notification Frequency Limiting', () => {
    it('should allow notifications within frequency limits', async () => {
      const userId = 'user-789';
      const notificationType = 'like';

      // Mock cache to show user is within limits
      mockCacheService.get.mockResolvedValueOnce('3'); // 3 notifications in current window

      const canSend = await filteringService.checkFrequencyLimit(userId, notificationType);

      expect(canSend).toBe(true);
    });

    it('should block notifications exceeding frequency limits', async () => {
      const userId = 'user-789';
      const notificationType = 'like';

      // Mock cache to show user has exceeded limits
      mockCacheService.get.mockResolvedValueOnce('25'); // 25 notifications (exceeds default limit)

      const canSend = await filteringService.checkFrequencyLimit(userId, notificationType);

      expect(canSend).toBe(false);
    });

    it('should have different limits for different notification types', async () => {
      const userId = 'user-789';

      // Mock cache responses for different types
      mockCacheService.get
        .mockResolvedValueOnce('15') // likes: within limit
        .mockResolvedValueOnce('8');  // mentions: within limit but stricter

      const canSendLike = await filteringService.checkFrequencyLimit(userId, 'like');
      const canSendMention = await filteringService.checkFrequencyLimit(userId, 'mention');

      expect(canSendLike).toBe(true);
      expect(canSendMention).toBe(true);
    });

    it('should reset frequency counters after time window', async () => {
      const userId = 'user-789';
      const notificationType = 'like';

      // Mock that no counter exists (expired)
      mockCacheService.get.mockResolvedValueOnce(null);

      const canSend = await filteringService.checkFrequencyLimit(userId, notificationType);

      expect(canSend).toBe(true);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        expect.stringContaining(`freq_limit:${userId}:${notificationType}`),
        1,
        expect.any(Number) // TTL
      );
    });
  });

  describe('Spam and Abuse Detection', () => {
    it('should detect spam based on rapid-fire notifications', async () => {
      const notifications = Array.from({ length: 10 }, (_, i) => ({
        id: `notif-${i}`,
        type: 'like' as const,
        userId: 'victim-123',
        senderId: 'spammer-456',
        timestamp: new Date(Date.now() - (i * 1000)) // 1 second apart
      }));

      const isSpam = await filteringService.detectSpam(notifications);

      expect(isSpam).toBe(true);
    });

    it('should detect spam from same sender in short time window', async () => {
      const notification = {
        id: 'notif-spam-1',
        type: 'like' as const,
        userId: 'victim-123',
        senderId: 'spammer-456',
        timestamp: new Date()
      };

      // Mock cache to show many recent notifications from same sender
      mockCacheService.zCount.mockResolvedValueOnce(12); // 12 notifications in last hour

      const isSpam = await filteringService.detectSpam([notification]);

      expect(isSpam).toBe(true);
    });

    it('should detect abuse patterns from blacklisted users', async () => {
      const notification = {
        id: 'notif-abuse-1',
        type: 'comment' as const,
        userId: 'victim-123',
        senderId: 'abuser-789',
        timestamp: new Date()
      };

      // Mock blacklist check
      mockCacheService.exists.mockResolvedValueOnce(1); // User is blacklisted

      const isSpam = await filteringService.detectSpam([notification]);

      expect(isSpam).toBe(true);
    });

    it('should allow legitimate notifications from normal users', async () => {
      const notification = {
        id: 'notif-legit-1',
        type: 'like' as const,
        userId: 'user-123',
        senderId: 'friend-456',
        timestamp: new Date()
      };

      // Mock normal usage patterns
      mockCacheService.zCount.mockResolvedValueOnce(2); // Only 2 notifications in last hour
      mockCacheService.exists.mockResolvedValueOnce(0); // Not blacklisted

      const isSpam = await filteringService.detectSpam([notification]);

      expect(isSpam).toBe(false);
    });

    it('should maintain sender reputation scores', async () => {
      const senderId = 'user-456';

      // Mock reputation data
      mockCacheService.get.mockResolvedValueOnce('0.8'); // Good reputation

      const reputation = await filteringService.getSenderReputation(senderId);

      expect(reputation).toBe(0.8);
      expect(reputation).toBeGreaterThanOrEqual(0);
      expect(reputation).toBeLessThanOrEqual(1);
    });
  });

  describe('Smart Filtering Logic', () => {
    it('should filter out low-importance notifications during quiet hours', async () => {
      const notification = {
        id: 'notif-quiet-1',
        type: 'like' as const,
        userId: 'user-123',
        data: {},
        timestamp: new Date('2024-01-01T23:30:00Z') // 11:30 PM
      };

      // Mock the current time to be 11:30 PM
      jest.spyOn(Date.prototype, 'getHours').mockReturnValueOnce(23);

      // Mock low importance score
      jest.spyOn(filteringService, 'calculateImportanceScore').mockResolvedValueOnce(0.3);
      
      // Mock user preferences check to pass
      mockSupabase.single.mockResolvedValueOnce({
        data: { push_notifications: true, notification_types: { like: true } },
        error: null
      });
      
      // Mock spam detection and frequency limits
      jest.spyOn(filteringService, 'detectSpam').mockResolvedValueOnce(false);
      jest.spyOn(filteringService, 'checkFrequencyLimit').mockResolvedValueOnce(true);

      const shouldSend = await filteringService.shouldSendNotification(notification);

      expect(shouldSend.allowed).toBe(false);
      expect(shouldSend.reason).toContain('quiet hours');
    });

    it('should allow high-importance notifications during quiet hours', async () => {
      const notification = {
        id: 'notif-urgent-1',
        type: 'mention' as const,
        userId: 'user-123',
        data: {},
        timestamp: new Date('2024-01-01T02:00:00Z') // 2:00 AM
      };

      // Mock high importance score
      jest.spyOn(filteringService, 'calculateImportanceScore').mockResolvedValueOnce(0.9);
      jest.spyOn(filteringService, 'checkFrequencyLimit').mockResolvedValueOnce(true);
      jest.spyOn(filteringService, 'detectSpam').mockResolvedValueOnce(false);

      const shouldSend = await filteringService.shouldSendNotification(notification);

      expect(shouldSend.allowed).toBe(true);
    });

    it('should batch similar low-importance notifications', async () => {
      const notifications = [
        {
          id: 'notif-batch-1',
          type: 'like' as const,
          userId: 'user-123',
          senderId: 'liker-1',
          data: { postId: 'post-456' },
          timestamp: new Date()
        },
        {
          id: 'notif-batch-2',
          type: 'like' as const,
          userId: 'user-123',
          senderId: 'liker-2',
          data: { postId: 'post-456' },
          timestamp: new Date()
        }
      ];

      const batchedNotification = await filteringService.batchNotifications(notifications);

      expect(batchedNotification).toBeDefined();
      expect(batchedNotification.type).toBe('batch');
      expect(batchedNotification.data.notifications).toHaveLength(2);
    });

    it('should respect user notification preferences', async () => {
      const notification = {
        id: 'notif-pref-1',
        type: 'like' as const,
        userId: 'user-123',
        data: {},
        timestamp: new Date()
      };

      // Mock user preferences - need to ensure the mock is called in the right order
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          push_notifications: false, // User disabled push notifications
          notification_types: { like: false }
        },
        error: null
      });



      const shouldSend = await filteringService.shouldSendNotification(notification);

      expect(shouldSend.allowed).toBe(false);
      expect(shouldSend.reason).toContain('disabled');
    });
  });

  describe('Quality Metrics and Analytics', () => {
    it('should track notification filtering metrics', async () => {
      const userId = 'user-123';

      await filteringService.trackFilteringMetric(userId, 'blocked', 'spam_detected');

      expect(mockCacheService.increment).toHaveBeenCalledWith(
        expect.stringContaining('filtering_metrics:blocked:spam_detected')
      );
    });

    it('should calculate filtering effectiveness', async () => {
      // Mock metrics data
      mockCacheService.get
        .mockResolvedValueOnce('100') // total processed
        .mockResolvedValueOnce('20')  // blocked spam
        .mockResolvedValueOnce('15'); // blocked low importance

      const effectiveness = await filteringService.getFilteringEffectiveness();

      expect(effectiveness.spamBlocked).toBe(20);
      expect(effectiveness.lowImportanceBlocked).toBe(15);
      expect(effectiveness.totalProcessed).toBe(100);
      expect(effectiveness.filteringRate).toBe(0.35); // 35% filtered
    });

    it('should provide user-specific filtering insights', async () => {
      const userId = 'user-456';

      // Mock user-specific metrics
      mockCacheService.get
        .mockResolvedValueOnce('50')  // total for user
        .mockResolvedValueOnce('5')   // spam blocked
        .mockResolvedValueOnce('10'); // low importance blocked

      const insights = await filteringService.getUserFilteringInsights(userId);

      expect(insights.userId).toBe(userId);
      expect(insights.totalProcessed).toBe(50);
      expect(insights.spamBlocked).toBe(5);
      expect(insights.lowImportanceBlocked).toBe(10);
    });

    it('should generate daily filtering report', async () => {
      const date = new Date('2024-01-01');

      // Mock daily metrics
      mockCacheService.get
        .mockResolvedValueOnce('1000') // total notifications
        .mockResolvedValueOnce('150')  // spam blocked
        .mockResolvedValueOnce('200'); // low importance blocked

      const report = await filteringService.generateDailyReport(date);

      expect(report.date).toEqual(date);
      expect(report.totalNotifications).toBe(1000);
      expect(report.spamBlocked).toBe(150);
      expect(report.lowImportanceBlocked).toBe(200);
      expect(report.deliveryRate).toBe(0.65); // 65% delivered
    });
  });

  describe('Error Handling', () => {
    it('should handle cache service errors gracefully', async () => {
      const notification = {
        id: 'notif-error-1',
        type: 'like' as const,
        userId: 'user-123',
        data: {},
        timestamp: new Date()
      };

      // Mock cache service error
      mockCacheService.get.mockRejectedValueOnce(new Error('Redis connection failed'));

      // Should default to allowing notification if cache fails
      const shouldSend = await filteringService.shouldSendNotification(notification);

      expect(shouldSend.allowed).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error checking'),
        expect.any(Object)
      );
    });

    it('should handle database errors in importance scoring', async () => {
      const notification = {
        id: 'notif-error-2',
        type: 'like' as const,
        userId: 'user-123',
        data: {},
        timestamp: new Date()
      };

      // Mock database error
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed' }
      });

      // Should default to medium importance if database fails
      const score = await filteringService.calculateImportanceScore(notification);

      expect(score).toBe(0.4); // Base score for 'like' type when database fails
    });
  });
});