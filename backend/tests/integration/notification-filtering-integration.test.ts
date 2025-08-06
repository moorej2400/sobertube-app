/**
 * Notification Filtering Integration Tests
 * Tests the integration between the notification filtering service and WebSocket events
 */

import { WebSocketEventsService } from '../../src/services/websocketEvents';

import { getRedisCacheService } from '../../src/services/redisCacheService';
import { getSupabaseClient } from '../../src/services/supabase';
import { logger } from '../../src/utils/logger';
import { NotificationPayload } from '../../src/websocket/types';

// Mock dependencies
jest.mock('../../src/services/redisCacheService');
jest.mock('../../src/services/supabase');
jest.mock('../../src/utils/logger');

describe('Notification Filtering Integration', () => {
  let webSocketEventsService: WebSocketEventsService;
  let mockWebSocketServer: any;
  let mockCacheService: any;
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock WebSocket server
    mockWebSocketServer = {
      broadcastToUser: jest.fn()
    };

    // Mock cache service
    mockCacheService = {
      isReady: jest.fn().mockReturnValue(true),
      get: jest.fn(),
      set: jest.fn(),
      increment: jest.fn(),
      exists: jest.fn(),
      zAdd: jest.fn(),
      zCount: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined)
    };
    (getRedisCacheService as jest.Mock).mockReturnValue(mockCacheService);

    // Mock Supabase
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn()
    };
    (getSupabaseClient as jest.Mock).mockImplementation(() => mockSupabase);

    // Get singleton instance and set WebSocket server
    webSocketEventsService = WebSocketEventsService.getInstance();
    webSocketEventsService.setWebSocketServer(mockWebSocketServer);
  });

  describe('Smart Notification Filtering', () => {
    it('should allow high-importance notifications to pass through', async () => {
      const notification: NotificationPayload = {
        id: 'notif-important-1',
        type: 'mention',
        title: 'You were mentioned',
        message: 'Someone mentioned you in a post',
        data: { mentionedByFollower: true },
        createdAt: new Date(),
        isRead: false
      };

      // Mock user preferences to allow notifications
      mockSupabase.single.mockResolvedValueOnce({
        data: { push_notifications: true, notification_types: { mention: true } },
        error: null
      });

      // Mock frequency limit check (within limits)
      mockCacheService.get.mockResolvedValueOnce('2'); // 2 notifications in current window

      // Mock spam detection (not spam)
      mockCacheService.exists.mockResolvedValueOnce(0); // Not blacklisted
      mockCacheService.zCount.mockResolvedValueOnce(3); // 3 notifications from sender in last hour

      await webSocketEventsService.emitNotification('user-123', notification);

      expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith(
        'user-123',
        'notification:new',
        notification
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Notification emitted successfully',
        expect.objectContaining({
          component: 'WebSocketEventsService',
          userId: 'user-123',
          notificationId: 'notif-important-1',
          notificationType: 'mention',
          filtered: false
        })
      );
    });

    it('should block notifications that exceed frequency limits', async () => {
      const notification: NotificationPayload = {
        id: 'notif-spam-1',
        type: 'like',
        title: 'New like',
        message: 'Someone liked your post',
        data: {},
        createdAt: new Date(),
        isRead: false
      };

      // Mock user preferences to allow notifications
      mockSupabase.single.mockResolvedValueOnce({
        data: { push_notifications: true, notification_types: { like: true } },
        error: null
      });

      // Mock frequency limit check (exceeded)
      mockCacheService.get.mockResolvedValueOnce('25'); // 25 notifications in current window (exceeds limit)

      await webSocketEventsService.emitNotification('user-456', notification);

      expect(mockWebSocketServer.broadcastToUser).not.toHaveBeenCalled();

      expect(logger.info).toHaveBeenCalledWith(
        'Notification filtered',
        expect.objectContaining({
          component: 'WebSocketEventsService',
          userId: 'user-456',
          notificationId: 'notif-spam-1',
          reason: expect.stringContaining('Frequency limit exceeded')
        })
      );
    });

    it('should block notifications from blacklisted users', async () => {
      const notification: NotificationPayload = {
        id: 'notif-abuse-1',
        type: 'comment',
        title: 'New comment',
        message: 'Someone commented on your post',
        data: { senderId: 'abuser-789' },
        createdAt: new Date(),
        isRead: false
      };

      // Mock user preferences to allow notifications
      mockSupabase.single.mockResolvedValueOnce({
        data: { push_notifications: true, notification_types: { comment: true } },
        error: null
      });

      // Mock frequency limit check (within limits)
      mockCacheService.get.mockResolvedValueOnce('3');

      // Mock spam detection (blacklisted user)
      mockCacheService.exists.mockResolvedValueOnce(1); // User is blacklisted

      await webSocketEventsService.emitNotification('victim-123', notification);

      expect(mockWebSocketServer.broadcastToUser).not.toHaveBeenCalled();

      expect(logger.info).toHaveBeenCalledWith(
        'Notification filtered',
        expect.objectContaining({
          component: 'WebSocketEventsService',
          userId: 'victim-123',
          notificationId: 'notif-abuse-1',
          reason: expect.stringContaining('spam or abuse')
        })
      );
    });

    it('should respect user notification preferences', async () => {
      const notification: NotificationPayload = {
        id: 'notif-disabled-1',
        type: 'like',
        title: 'New like',
        message: 'Someone liked your post',
        data: {},
        createdAt: new Date(),
        isRead: false
      };

      // Mock user preferences (likes disabled)
      mockSupabase.single.mockResolvedValueOnce({
        data: { push_notifications: true, notification_types: { like: false } },
        error: null
      });

      await webSocketEventsService.emitNotification('user-789', notification);

      expect(mockWebSocketServer.broadcastToUser).not.toHaveBeenCalled();

      expect(logger.info).toHaveBeenCalledWith(
        'Notification filtered',
        expect.objectContaining({
          component: 'WebSocketEventsService',
          userId: 'user-789',
          notificationId: 'notif-disabled-1',
          reason: expect.stringContaining('disabled like notifications')
        })
      );
    });

    it('should suggest batching for low-importance notifications', async () => {
      const notification: NotificationPayload = {
        id: 'notif-low-importance-1',
        type: 'like',
        title: 'New like',
        message: 'Someone liked your post',
        data: { likerIsFollower: false }, // Low importance
        createdAt: new Date(),
        isRead: false
      };

      // Mock user preferences to allow notifications
      mockSupabase.single.mockResolvedValueOnce({
        data: { push_notifications: true, notification_types: { like: true } },
        error: null
      });

      // Mock user engagement history (low engagement)
      mockSupabase.single.mockResolvedValueOnce({
        data: { avg_open_rate: 0.2, preferred_types: [] },
        error: null
      });

      // Mock frequency limit check (within limits)
      mockCacheService.get.mockResolvedValueOnce('3');

      // Mock spam detection (not spam)
      mockCacheService.exists.mockResolvedValueOnce(0);
      mockCacheService.zCount.mockResolvedValueOnce(2);

      await webSocketEventsService.emitNotification('user-101', notification);

      // Should still emit but with batching suggestion logged
      expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith(
        'user-101',
        'notification:new',
        notification
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Notification suggested for batching'),
        expect.objectContaining({
          component: 'WebSocketEventsService',
          userId: 'user-101',
          notificationId: 'notif-low-importance-1'
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should emit notification if filtering service fails', async () => {
      const notification: NotificationPayload = {
        id: 'notif-error-1',
        type: 'system',
        title: 'System notification',
        message: 'System update',
        data: {},
        createdAt: new Date(),
        isRead: false
      };

      // Mock cache service error
      mockCacheService.get.mockRejectedValueOnce(new Error('Cache connection failed'));

      await webSocketEventsService.emitNotification('user-error', notification);

      // Should still emit notification when filtering fails
      expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith(
        'user-error',
        'notification:new',
        notification
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Notification emitted successfully',
        expect.objectContaining({
          component: 'WebSocketEventsService',
          userId: 'user-error',
          notificationId: 'notif-error-1',
          filtered: false
        })
      );
    });

    it('should handle WebSocket server unavailable gracefully', async () => {
      const notification: NotificationPayload = {
        id: 'notif-no-ws-1',
        type: 'like',
        title: 'New like',
        message: 'Someone liked your post',
        data: {},
        createdAt: new Date(),
        isRead: false
      };

      // Remove WebSocket server to simulate unavailable state
      webSocketEventsService.setWebSocketServer(null);

      await webSocketEventsService.emitNotification('user-no-ws', notification);

      expect(logger.warn).toHaveBeenCalledWith(
        'WebSocket server not available for notification',
        expect.objectContaining({
          component: 'WebSocketEventsService',
          userId: 'user-no-ws',
          notificationId: 'notif-no-ws-1'
        })
      );
    });
  });

  describe('Performance and Metrics', () => {
    it('should track filtering metrics when notifications are blocked', async () => {
      const notification: NotificationPayload = {
        id: 'notif-metrics-1',
        type: 'like',
        title: 'New like',
        message: 'Someone liked your post',
        data: {},
        createdAt: new Date(),
        isRead: false
      };

      // Mock user preferences (push notifications disabled)
      mockSupabase.single.mockResolvedValueOnce({
        data: { push_notifications: false, notification_types: { like: true } },
        error: null
      });

      await webSocketEventsService.emitNotification('user-metrics', notification);

      // Verify that filtering metrics were tracked
      expect(mockCacheService.increment).toHaveBeenCalledWith(
        expect.stringContaining('filtering_metrics:blocked:user_preferences')
      );
    });

    it('should include importance scores in successful emission logs', async () => {
      const notification: NotificationPayload = {
        id: 'notif-importance-1',
        type: 'mention',
        title: 'You were mentioned',
        message: 'Someone mentioned you in a post',
        data: { mentionedByFollower: true },
        createdAt: new Date(),
        isRead: false
      };

      // Mock user preferences to allow notifications
      mockSupabase.single.mockResolvedValueOnce({
        data: { push_notifications: true, notification_types: { mention: true } },
        error: null
      });

      // Mock frequency limit check
      mockCacheService.get.mockResolvedValueOnce('1');

      // Mock spam detection
      mockCacheService.exists.mockResolvedValueOnce(0);
      mockCacheService.zCount.mockResolvedValueOnce(1);

      await webSocketEventsService.emitNotification('user-importance', notification);

      expect(logger.info).toHaveBeenCalledWith(
        'Notification emitted successfully',
        expect.objectContaining({
          component: 'WebSocketEventsService',
          userId: 'user-importance',
          importanceScore: expect.any(Number),
          filtered: false
        })
      );
    });
  });
});