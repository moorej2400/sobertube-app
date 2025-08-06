/**
 * Notification Scheduler Unit Tests
 * Tests for scheduling notifications, batching, queuing, and delayed delivery
 */

import { NotificationScheduler } from '../../src/services/notificationScheduler';
import { NotificationQueue } from '../../src/services/notificationQueue';
import { NotificationBatchProcessor } from '../../src/services/notificationBatchProcessor';
import { PushNotificationService } from '../../src/services/pushNotificationService';
import { NotificationPreferencesService } from '../../src/services/notificationPreferencesService';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/services/pushNotificationService');
jest.mock('../../src/services/notificationPreferencesService');
jest.mock('../../src/utils/logger');

// Mock Redis for queue management
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    lPush: jest.fn().mockResolvedValue(1),
    rPop: jest.fn().mockResolvedValue(null),
    lLen: jest.fn().mockResolvedValue(0),
    zAdd: jest.fn().mockResolvedValue(1),
    zRangeByScore: jest.fn().mockResolvedValue([]),
    zRem: jest.fn().mockResolvedValue(1),
    setEx: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1)
  }))
}));

describe('NotificationScheduler', () => {
  let scheduler: NotificationScheduler;
  let mockPushService: jest.Mocked<PushNotificationService>;
  let mockPreferencesService: jest.Mocked<NotificationPreferencesService>;
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPushService = new PushNotificationService() as jest.Mocked<PushNotificationService>;
    mockPreferencesService = new NotificationPreferencesService() as jest.Mocked<NotificationPreferencesService>;
    
    mockRedisClient = require('redis').createClient();
    
    scheduler = new NotificationScheduler(mockPushService, mockPreferencesService);
  });

  describe('Immediate Notification Scheduling', () => {
    it('should schedule immediate notification for single user', async () => {
      const notification = {
        id: 'notif-123',
        userId: 'user-456',
        templateId: 'like_notification',
        variables: {
          username: 'John Doe',
          postId: 'post-789'
        },
        priority: 'normal' as const,
        scheduledFor: new Date()
      };

      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);
      mockPreferencesService.isInQuietHours.mockResolvedValue(false);
      mockPreferencesService.getUserDeviceTokens.mockResolvedValue([
        { id: '1', device_token: 'token-123', platform: 'android', is_active: true }
      ]);
      mockPushService.sendToDevice.mockResolvedValue({ success: true, messageId: 'msg-123' });

      const result = await scheduler.scheduleNotification(notification);

      expect(result.success).toBe(true);
      expect(result.notificationId).toBe('notif-123');
      expect(result.scheduledFor).toEqual(notification.scheduledFor);
      expect(mockPushService.sendToDevice).toHaveBeenCalled();
    });

    it('should respect user quiet hours for immediate notifications', async () => {
      const notification = {
        id: 'notif-123',
        userId: 'user-456',
        templateId: 'like_notification',
        variables: { username: 'John' },
        priority: 'normal' as const,
        scheduledFor: new Date() // Now, but user is in quiet hours
      };

      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);
      mockPreferencesService.isInQuietHours.mockResolvedValue(true);
      mockPreferencesService.getUserDeviceTokens.mockResolvedValue([
        { id: '1', device_token: 'token-123', platform: 'android', is_active: true }
      ]);

      const result = await scheduler.scheduleNotification(notification);

      expect(result.success).toBe(true);
      expect(result.delayed).toBe(true);
      expect(result.delayReason).toBe('quiet_hours');
      expect(mockPushService.sendToDevice).not.toHaveBeenCalled(); // Should not send immediately
      
      // Should be added to delayed queue
      expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
        'notifications:delayed',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should skip notification if user has disabled notification type', async () => {
      const notification = {
        id: 'notif-123',
        userId: 'user-456',
        templateId: 'like_notification',
        variables: { username: 'John' },
        priority: 'normal' as const,
        scheduledFor: new Date()
      };

      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(false);

      const result = await scheduler.scheduleNotification(notification);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('notification_type_disabled');
      expect(mockPushService.sendToDevice).not.toHaveBeenCalled();
    });

    it('should override quiet hours for high priority notifications', async () => {
      const notification = {
        id: 'notif-urgent',
        userId: 'user-456',
        templateId: 'emergency_notification',
        variables: { message: 'Emergency alert' },
        priority: 'high' as const,
        scheduledFor: new Date(),
        overrideQuietHours: true
      };

      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);
      mockPreferencesService.isInQuietHours.mockResolvedValue(true);
      mockPreferencesService.getUserDeviceTokens.mockResolvedValue([
        { id: '1', device_token: 'token-123', platform: 'android', is_active: true }
      ]);
      mockPushService.sendToDevice.mockResolvedValue({ success: true, messageId: 'msg-123' });

      const result = await scheduler.scheduleNotification(notification);

      expect(result.success).toBe(true);
      expect(result.delayed).toBeFalsy();
      expect(mockPushService.sendToDevice).toHaveBeenCalled(); // Should send despite quiet hours
    });
  });

  describe('Delayed Notification Scheduling', () => {
    it('should schedule notification for future delivery', async () => {
      const futureTime = new Date(Date.now() + 3600000); // 1 hour from now
      const notification = {
        id: 'notif-delayed',
        userId: 'user-456',
        templateId: 'reminder_notification',
        variables: { reminderText: 'Daily check-in' },
        priority: 'normal' as const,
        scheduledFor: futureTime
      };

      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);

      const result = await scheduler.scheduleNotification(notification);

      expect(result.success).toBe(true);
      expect(result.delayed).toBe(true);
      expect(result.scheduledFor).toEqual(futureTime);
      
      // Should be added to delayed queue with correct timestamp
      expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
        'notifications:delayed',
        futureTime.getTime(),
        JSON.stringify(notification)
      );
    });

    it('should process due delayed notifications', async () => {
      const now = Date.now();
      const dueNotifications = [
        JSON.stringify({
          id: 'notif-1',
          userId: 'user-1',
          templateId: 'reminder',
          variables: { text: 'Reminder 1' }
        }),
        JSON.stringify({
          id: 'notif-2',
          userId: 'user-2',
          templateId: 'reminder',
          variables: { text: 'Reminder 2' }
        })
      ];

      mockRedisClient.zRangeByScore.mockResolvedValue(dueNotifications);
      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);
      mockPreferencesService.isInQuietHours.mockResolvedValue(false);
      mockPreferencesService.getUserDeviceTokens.mockResolvedValue([
        { id: '1', device_token: 'token-123', platform: 'android', is_active: true }
      ]);
      mockPushService.sendToDevice.mockResolvedValue({ success: true, messageId: 'msg-123' });

      const result = await scheduler.processDueNotifications();

      expect(result.processed).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockPushService.sendToDevice).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.zRem).toHaveBeenCalledTimes(2); // Remove from delayed queue
    });

    it('should handle errors in delayed notification processing', async () => {
      const dueNotifications = [
        JSON.stringify({
          id: 'notif-fail',
          userId: 'user-1',
          templateId: 'reminder',
          variables: {}
        })
      ];

      mockRedisClient.zRangeByScore.mockResolvedValue(dueNotifications);
      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);
      mockPreferencesService.getUserDeviceTokens.mockRejectedValue(new Error('Database error'));

      const result = await scheduler.processDueNotifications();

      expect(result.processed).toBe(1);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(1);
      expect(logger.error).toHaveBeenCalledWith('Failed to process delayed notification', expect.any(Object));
    });
  });

  describe('Notification Batching', () => {
    it('should batch notifications for the same user', async () => {
      const notifications = [
        {
          id: 'notif-1',
          userId: 'user-123',
          templateId: 'like_notification',
          variables: { username: 'John', postId: 'post-1' },
          priority: 'normal' as const,
          scheduledFor: new Date()
        },
        {
          id: 'notif-2',
          userId: 'user-123',
          templateId: 'like_notification',
          variables: { username: 'Jane', postId: 'post-2' },
          priority: 'normal' as const,
          scheduledFor: new Date()
        },
        {
          id: 'notif-3',
          userId: 'user-123',
          templateId: 'comment_notification',
          variables: { username: 'Bob', postId: 'post-1' },
          priority: 'normal' as const,
          scheduledFor: new Date()
        }
      ];

      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);
      mockPreferencesService.isInQuietHours.mockResolvedValue(false);
      mockPreferencesService.getUserDeviceTokens.mockResolvedValue([
        { id: '1', device_token: 'token-123', platform: 'android', is_active: true }
      ]);
      mockPushService.sendToDevice.mockResolvedValue({ success: true, messageId: 'msg-123' });

      const result = await scheduler.batchScheduleNotifications(notifications);

      expect(result.totalScheduled).toBe(3);
      expect(result.totalBatched).toBe(2); // 2 like notifications batched together
      expect(result.batchGroups).toHaveLength(2); // 1 batch for likes, 1 single comment

      // Should send fewer notifications due to batching
      expect(mockPushService.sendToDevice).toHaveBeenCalledTimes(2);
    });

    it('should respect batching window for delayed notifications', async () => {
      const batchWindow = 5 * 60 * 1000; // 5 minutes
      scheduler.setBatchingOptions({
        enabled: true,
        windowMs: batchWindow,
        maxBatchSize: 10,
        batchSimilarTypes: true
      });

      const notification = {
        id: 'notif-batch',
        userId: 'user-123',
        templateId: 'like_notification',
        variables: { username: 'John' },
        priority: 'normal' as const,
        scheduledFor: new Date()
      };

      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);

      const result = await scheduler.scheduleNotification(notification);

      expect(result.success).toBe(true);
      expect(result.batched).toBe(true);
      expect(result.batchWindowEnd).toBeDefined();

      // Should be added to batching queue
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        `batch:user-123:like_notification`,
        batchWindow / 1000,
        expect.any(String)
      );
    });

    it('should process batched notifications when window expires', async () => {
      const batchKey = 'batch:user-123:like_notification';
      const batchedNotifications = JSON.stringify([
        {
          id: 'notif-1',
          variables: { username: 'John', postId: 'post-1' }
        },
        {
          id: 'notif-2',
          variables: { username: 'Jane', postId: 'post-2' }
        }
      ]);

      mockRedisClient.get.mockResolvedValue(batchedNotifications);
      mockPreferencesService.getUserDeviceTokens.mockResolvedValue([
        { id: '1', device_token: 'token-123', platform: 'android', is_active: true }
      ]);
      mockPushService.sendToDevice.mockResolvedValue({ success: true, messageId: 'msg-123' });

      const result = await scheduler.processBatch(batchKey);

      expect(result.success).toBe(true);
      expect(result.notificationsSent).toBe(1); // One batched notification sent
      expect(result.originalCount).toBe(2);
      
      // Should delete batch after processing
      expect(mockRedisClient.del).toHaveBeenCalledWith(batchKey);
    });

    it('should not batch high priority notifications', async () => {
      const notifications = [
        {
          id: 'notif-urgent',
          userId: 'user-123',
          templateId: 'emergency_notification',
          variables: { message: 'Urgent alert' },
          priority: 'high' as const,
          scheduledFor: new Date()
        },
        {
          id: 'notif-normal',
          userId: 'user-123',
          templateId: 'like_notification',
          variables: { username: 'John' },
          priority: 'normal' as const,
          scheduledFor: new Date()
        }
      ];

      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);
      mockPreferencesService.isInQuietHours.mockResolvedValue(false);
      mockPreferencesService.getUserDeviceTokens.mockResolvedValue([
        { id: '1', device_token: 'token-123', platform: 'android', is_active: true }
      ]);
      mockPushService.sendToDevice.mockResolvedValue({ success: true, messageId: 'msg-123' });

      const result = await scheduler.batchScheduleNotifications(notifications);

      expect(result.totalScheduled).toBe(2);
      expect(result.totalBatched).toBe(0); // High priority not batched
      expect(mockPushService.sendToDevice).toHaveBeenCalledTimes(2); // Both sent separately
    });
  });

  describe('Queue Management', () => {
    it('should add notifications to processing queue', async () => {
      const notification = {
        id: 'notif-queue',
        userId: 'user-123',
        templateId: 'like_notification',
        variables: { username: 'John' }
      };

      await scheduler.enqueueNotification(notification);

      expect(mockRedisClient.lPush).toHaveBeenCalledWith(
        'notifications:queue',
        JSON.stringify(notification)
      );
    });

    it('should process notifications from queue in order', async () => {
      const queuedNotifications = [
        JSON.stringify({
          id: 'notif-1',
          userId: 'user-1',
          templateId: 'like_notification',
          variables: { username: 'John' }
        }),
        JSON.stringify({
          id: 'notif-2',
          userId: 'user-2',
          templateId: 'comment_notification',
          variables: { username: 'Jane' }
        })
      ];

      mockRedisClient.rPop
        .mockResolvedValueOnce(queuedNotifications[0])
        .mockResolvedValueOnce(queuedNotifications[1])
        .mockResolvedValueOnce(null); // End of queue

      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);
      mockPreferencesService.isInQuietHours.mockResolvedValue(false);
      mockPreferencesService.getUserDeviceTokens.mockResolvedValue([
        { id: '1', device_token: 'token-123', platform: 'android', is_active: true }
      ]);
      mockPushService.sendToDevice.mockResolvedValue({ success: true, messageId: 'msg-123' });

      const result = await scheduler.processQueue();

      expect(result.processed).toBe(2);
      expect(result.successful).toBe(2);
      expect(mockPushService.sendToDevice).toHaveBeenCalledTimes(2);
    });

    it('should get queue statistics', async () => {
      mockRedisClient.lLen
        .mockResolvedValueOnce(25) // Main queue
        .mockResolvedValueOnce(5) // Priority queue
        .mockResolvedValueOnce(10); // Delayed queue (count of items)

      const stats = await scheduler.getQueueStats();

      expect(stats).toEqual({
        mainQueue: 25,
        priorityQueue: 5,
        delayedQueue: 10,
        totalPending: 40
      });
    });

    it('should prioritize high priority notifications in queue', async () => {
      const highPriorityNotification = {
        id: 'notif-urgent',
        userId: 'user-123',
        templateId: 'emergency_notification',
        variables: { message: 'Emergency' },
        priority: 'high' as const
      };

      await scheduler.enqueueNotification(highPriorityNotification);

      expect(mockRedisClient.lPush).toHaveBeenCalledWith(
        'notifications:priority_queue', // Should go to priority queue
        JSON.stringify(highPriorityNotification)
      );
    });
  });

  describe('Retry and Error Handling', () => {
    it('should retry failed notifications', async () => {
      const notification = {
        id: 'notif-retry',
        userId: 'user-123',
        templateId: 'like_notification',
        variables: { username: 'John' },
        priority: 'normal' as const,
        scheduledFor: new Date(),
        retryCount: 0,
        maxRetries: 3
      };

      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);
      mockPreferencesService.isInQuietHours.mockResolvedValue(false);
      mockPreferencesService.getUserDeviceTokens.mockResolvedValue([
        { id: '1', device_token: 'token-123', platform: 'android', is_active: true }
      ]);
      
      // Mock failure then success
      mockPushService.sendToDevice
        .mockResolvedValueOnce({ success: false, error: 'Network error' })
        .mockResolvedValueOnce({ success: true, messageId: 'msg-123' });

      const result = await scheduler.scheduleNotification(notification);

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
      expect(mockPushService.sendToDevice).toHaveBeenCalledTimes(2);
    });

    it('should give up after max retries', async () => {
      const notification = {
        id: 'notif-fail',
        userId: 'user-123',
        templateId: 'like_notification',
        variables: { username: 'John' },
        priority: 'normal' as const,
        scheduledFor: new Date(),
        retryCount: 3,
        maxRetries: 3
      };

      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);
      mockPreferencesService.isInQuietHours.mockResolvedValue(false);
      mockPreferencesService.getUserDeviceTokens.mockResolvedValue([
        { id: '1', device_token: 'token-123', platform: 'android', is_active: true }
      ]);
      mockPushService.sendToDevice.mockResolvedValue({ success: false, error: 'Persistent error' });

      const result = await scheduler.scheduleNotification(notification);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Max retries exceeded');
      expect(result.finalAttempt).toBe(true);
    });

    it('should use exponential backoff for retries', async () => {
      const notification = {
        id: 'notif-backoff',
        userId: 'user-123',
        templateId: 'like_notification',
        variables: { username: 'John' },
        priority: 'normal' as const,
        scheduledFor: new Date(),
        retryCount: 2,
        maxRetries: 5
      };

      const nextRetryTime = scheduler.calculateNextRetryTime(notification);
      const expectedDelay = Math.pow(2, notification.retryCount) * 1000; // 4 seconds for retry count 2

      expect(nextRetryTime.getTime()).toBeGreaterThanOrEqual(
        Date.now() + expectedDelay - 100 // Allow 100ms tolerance
      );
      expect(nextRetryTime.getTime()).toBeLessThanOrEqual(
        Date.now() + expectedDelay + 100
      );
    });
  });

  describe('Notification Rate Limiting', () => {
    it('should enforce rate limits per user', async () => {
      const userId = 'user-123';
      scheduler.setRateLimits({
        perUser: {
          perMinute: 5,
          perHour: 100,
          perDay: 500
        }
      });

      // Simulate 6 notifications in quick succession (exceeds per-minute limit)
      const notifications = Array.from({ length: 6 }, (_, i) => ({
        id: `notif-${i}`,
        userId,
        templateId: 'like_notification',
        variables: { username: `User${i}` },
        priority: 'normal' as const,
        scheduledFor: new Date()
      }));

      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);
      mockPreferencesService.isInQuietHours.mockResolvedValue(false);
      mockPreferencesService.getUserDeviceTokens.mockResolvedValue([
        { id: '1', device_token: 'token-123', platform: 'android', is_active: true }
      ]);
      mockPushService.sendToDevice.mockResolvedValue({ success: true, messageId: 'msg-123' });

      const results = await Promise.all(
        notifications.map(n => scheduler.scheduleNotification(n))
      );

      const successful = results.filter(r => r.success && !r.rateLimited).length;
      const rateLimited = results.filter(r => r.rateLimited).length;

      expect(successful).toBe(5); // First 5 should succeed
      expect(rateLimited).toBe(1); // Last one should be rate limited
    });

    it('should allow high priority notifications to bypass rate limits', async () => {
      const userId = 'user-123';
      scheduler.setRateLimits({
        perUser: {
          perMinute: 1,
          allowHighPriorityBypass: true
        }
      });

      const normalNotification = {
        id: 'notif-normal',
        userId,
        templateId: 'like_notification',
        variables: { username: 'John' },
        priority: 'normal' as const,
        scheduledFor: new Date()
      };

      const highPriorityNotification = {
        id: 'notif-urgent',
        userId,
        templateId: 'emergency_notification',
        variables: { message: 'Emergency' },
        priority: 'high' as const,
        scheduledFor: new Date()
      };

      mockPreferencesService.isNotificationTypeEnabled.mockResolvedValue(true);
      mockPreferencesService.isInQuietHours.mockResolvedValue(false);
      mockPreferencesService.getUserDeviceTokens.mockResolvedValue([
        { id: '1', device_token: 'token-123', platform: 'android', is_active: true }
      ]);
      mockPushService.sendToDevice.mockResolvedValue({ success: true, messageId: 'msg-123' });

      // Send normal notification first (uses up rate limit)
      const result1 = await scheduler.scheduleNotification(normalNotification);
      expect(result1.success).toBe(true);
      expect(result1.rateLimited).toBeFalsy();

      // High priority should bypass rate limit
      const result2 = await scheduler.scheduleNotification(highPriorityNotification);
      expect(result2.success).toBe(true);
      expect(result2.rateLimited).toBeFalsy();
      expect(result2.bypassedRateLimit).toBe(true);
    });
  });

  describe('Scheduler Lifecycle Management', () => {
    it('should start scheduler with background processing', async () => {
      await scheduler.start();

      expect(scheduler.isRunning()).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Notification scheduler started', expect.any(Object));
    });

    it('should stop scheduler and cleanup resources', async () => {
      await scheduler.start();
      await scheduler.stop();

      expect(scheduler.isRunning()).toBe(false);
      expect(logger.info).toHaveBeenCalledWith('Notification scheduler stopped', expect.any(Object));
    });

    it('should provide scheduler health status', () => {
      const health = scheduler.getHealthStatus();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('processedCount');
      expect(health).toHaveProperty('errorCount');
      expect(health).toHaveProperty('queueSizes');
    });
  });
});