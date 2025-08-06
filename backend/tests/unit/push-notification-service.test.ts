/**
 * Push Notification Service Unit Tests
 * Tests for Firebase Cloud Messaging (FCM) and Apple Push Notification service (APNs) integration
 */

import { PushNotificationService } from '../../src/services/pushNotificationService';
import { logger } from '../../src/utils/logger';

// Mock external push notification services
jest.mock('firebase-admin', () => ({
  messaging: jest.fn(() => ({
    send: jest.fn(),
    sendMulticast: jest.fn(),
    sendToTopic: jest.fn(),
    subscribeToTopic: jest.fn(),
    unsubscribeFromTopic: jest.fn()
  })),
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn()
  }
}));

jest.mock('apn', () => ({
  Provider: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ sent: [], failed: [] })
  })),
  Notification: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('../../src/utils/logger');

describe('PushNotificationService', () => {
  let pushNotificationService: PushNotificationService;
  let mockFCMMessaging: any;
  let mockAPNProvider: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Firebase messaging
    mockFCMMessaging = {
      send: jest.fn().mockResolvedValue('message-id-123'),
      sendMulticast: jest.fn().mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        responses: [
          { success: true, messageId: 'msg-1' },
          { success: true, messageId: 'msg-2' }
        ]
      }),
      sendToTopic: jest.fn().mockResolvedValue('topic-message-id-456'),
      subscribeToTopic: jest.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
      unsubscribeFromTopic: jest.fn().mockResolvedValue({ successCount: 1, failureCount: 0 })
    };

    // Mock APN Provider
    mockAPNProvider = {
      send: jest.fn().mockResolvedValue({ sent: [{ device: 'device-token-123' }], failed: [] })
    };

    pushNotificationService = new PushNotificationService();
    // Set mocked services
    (pushNotificationService as any).fcmMessaging = mockFCMMessaging;
    (pushNotificationService as any).apnProvider = mockAPNProvider;
  });

  describe('Firebase Cloud Messaging Integration', () => {
    it('should send FCM push notification to single device', async () => {
      const deviceToken = 'device-token-123';
      const notification = {
        title: 'New Like',
        body: 'John liked your post',
        data: { postId: 'post-123', type: 'like' }
      };

      const result = await pushNotificationService.sendToDevice(deviceToken, notification, 'android');

      expect(mockFCMMessaging.send).toHaveBeenCalledWith({
        token: deviceToken,
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: notification.data,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
          }
        }
      });
      expect(result).toEqual({ success: true, messageId: 'message-id-123' });
    });

    it('should send FCM push notification to multiple devices', async () => {
      const deviceTokens = ['token-1', 'token-2'];
      const notification = {
        title: 'New Comment',
        body: 'Someone commented on your post',
        data: { postId: 'post-456', type: 'comment' }
      };

      const result = await pushNotificationService.sendToDevices(deviceTokens, notification, 'android');

      expect(mockFCMMessaging.sendMulticast).toHaveBeenCalledWith({
        tokens: deviceTokens,
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: notification.data,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
          }
        }
      });
      expect(result).toEqual({
        success: true,
        successCount: 2,
        failureCount: 0,
        responses: [
          { success: true, messageId: 'msg-1' },
          { success: true, messageId: 'msg-2' }
        ]
      });
    });

    it('should send FCM notification to topic', async () => {
      const topic = 'trending-content';
      const notification = {
        title: 'Trending Now',
        body: 'Check out what\'s trending in recovery',
        data: { type: 'trending' }
      };

      const result = await pushNotificationService.sendToTopic(topic, notification, 'android');

      expect(mockFCMMessaging.sendToTopic).toHaveBeenCalledWith({
        topic,
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: notification.data,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
          }
        }
      });
      expect(result).toEqual({ success: true, messageId: 'topic-message-id-456' });
    });

    it('should handle FCM send failure gracefully', async () => {
      const deviceToken = 'invalid-token';
      const notification = {
        title: 'Test',
        body: 'Test message',
        data: { test: 'true' }
      };

      mockFCMMessaging.send.mockRejectedValueOnce(new Error('Invalid token'));

      const result = await pushNotificationService.sendToDevice(deviceToken, notification, 'android');

      expect(result).toEqual({
        success: false,
        error: 'Invalid token'
      });
      expect(logger.error).toHaveBeenCalledWith('FCM push notification failed', expect.any(Object));
    });
  });

  describe('Apple Push Notification Integration', () => {
    it('should send APNs push notification to single device', async () => {
      const deviceToken = 'apns-device-token-123';
      const notification = {
        title: 'New Follow',
        body: 'Jane started following you',
        data: { userId: 'user-789', type: 'follow' }
      };

      const result = await pushNotificationService.sendToDevice(deviceToken, notification, 'ios');

      expect(mockAPNProvider.send).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        sent: [{ device: 'device-token-123' }],
        failed: []
      });
    });

    it('should handle APNs send failure gracefully', async () => {
      const deviceToken = 'invalid-apns-token';
      const notification = {
        title: 'Test',
        body: 'Test message',
        data: { test: 'true' }
      };

      mockAPNProvider.send.mockRejectedValueOnce(new Error('Invalid device token'));

      const result = await pushNotificationService.sendToDevice(deviceToken, notification, 'ios');

      expect(result).toEqual({
        success: false,
        error: 'Invalid device token'
      });
      expect(logger.error).toHaveBeenCalledWith('APNs push notification failed', expect.any(Object));
    });

    it('should send APNs with correct payload structure', async () => {
      const deviceToken = 'apns-token-456';
      const notification = {
        title: 'Recovery Milestone',
        body: 'Congratulations on 30 days sober!',
        data: { milestoneType: 'days', count: '30' }
      };

      await pushNotificationService.sendToDevice(deviceToken, notification, 'ios');

      expect(mockAPNProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: expect.any(String), // Bundle ID
          payload: expect.objectContaining({
            aps: {
              alert: {
                title: notification.title,
                body: notification.body
              },
              sound: 'default',
              badge: 1
            },
            custom: notification.data
          })
        }),
        deviceToken
      );
    });
  });

  describe('Topic Management', () => {
    it('should subscribe device tokens to topics', async () => {
      const deviceTokens = ['token-1', 'token-2'];
      const topic = 'milestone-notifications';

      const result = await pushNotificationService.subscribeToTopic(deviceTokens, topic);

      expect(mockFCMMessaging.subscribeToTopic).toHaveBeenCalledWith(deviceTokens, topic);
      expect(result).toEqual({ success: true, successCount: 1, failureCount: 0 });
    });

    it('should unsubscribe device tokens from topics', async () => {
      const deviceTokens = ['token-1'];
      const topic = 'daily-reminders';

      const result = await pushNotificationService.unsubscribeFromTopic(deviceTokens, topic);

      expect(mockFCMMessaging.unsubscribeFromTopic).toHaveBeenCalledWith(deviceTokens, topic);
      expect(result).toEqual({ success: true, successCount: 1, failureCount: 0 });
    });

    it('should handle topic subscription failures', async () => {
      const deviceTokens = ['invalid-token'];
      const topic = 'test-topic';

      mockFCMMessaging.subscribeToTopic.mockRejectedValueOnce(new Error('Invalid registration token'));

      const result = await pushNotificationService.subscribeToTopic(deviceTokens, topic);

      expect(result).toEqual({
        success: false,
        error: 'Invalid registration token'
      });
      expect(logger.error).toHaveBeenCalledWith('Topic subscription failed', expect.any(Object));
    });
  });

  describe('Cross-Platform Notification', () => {
    it('should send notifications to mixed platform devices', async () => {
      const devices = [
        { token: 'android-token-1', platform: 'android' as const },
        { token: 'ios-token-1', platform: 'ios' as const },
        { token: 'web-token-1', platform: 'web' as const }
      ];
      const notification = {
        title: 'Community Update',
        body: 'New features available in the recovery app',
        data: { updateType: 'feature', version: '2.1.0' }
      };

      const result = await pushNotificationService.sendToMixedDevices(devices, notification);

      expect(mockFCMMessaging.sendMulticast).toHaveBeenCalledTimes(2); // Android and Web
      expect(mockAPNProvider.send).toHaveBeenCalledTimes(1); // iOS
      expect(result.totalSent).toBeGreaterThan(0);
      expect(result.platformResults).toHaveProperty('android');
      expect(result.platformResults).toHaveProperty('ios');
      expect(result.platformResults).toHaveProperty('web');
    });

    it('should handle partial failures in mixed platform sending', async () => {
      const devices = [
        { token: 'good-android-token', platform: 'android' as const },
        { token: 'bad-ios-token', platform: 'ios' as const }
      ];
      const notification = {
        title: 'Test',
        body: 'Test message',
        data: {}
      };

      mockAPNProvider.send.mockRejectedValueOnce(new Error('Invalid token'));

      const result = await pushNotificationService.sendToMixedDevices(devices, notification);

      expect(result.totalSent).toBe(1);
      expect(result.totalFailed).toBe(1);
      expect(result.platformResults.android.success).toBe(true);
      expect(result.platformResults.ios.success).toBe(false);
    });
  });

  describe('Service Initialization', () => {
    it('should initialize Firebase Admin SDK correctly', async () => {
      const config = {
        fcm: {
          serviceAccountPath: '/path/to/service-account.json',
          databaseURL: 'https://project-id.firebaseio.com'
        },
        apns: {
          keyPath: '/path/to/key.p8',
          keyId: 'ABC123DEF4',
          teamId: 'TEAM123',
          bundleId: 'com.sobertube.app',
          production: false
        }
      };

      await pushNotificationService.initialize(config);

      expect(require('firebase-admin').initializeApp).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Push notification services initialized', expect.any(Object));
    });

    it('should handle initialization failures gracefully', async () => {
      const config = {
        fcm: { serviceAccountPath: '/invalid/path.json' },
        apns: { keyPath: '/invalid/key.p8', keyId: '', teamId: '', bundleId: '', production: false }
      };

      require('firebase-admin').initializeApp.mockImplementationOnce(() => {
        throw new Error('Invalid service account');
      });

      await expect(pushNotificationService.initialize(config)).rejects.toThrow('Invalid service account');
      expect(logger.error).toHaveBeenCalledWith('Failed to initialize push notification services', expect.any(Object));
    });
  });

  describe('Device Token Validation', () => {
    it('should validate FCM device tokens', () => {
      const validToken = 'eHcE_Z8mQ0-9:APA91bF8Q9XQ_9...'; // Typical FCM token format
      const invalidToken = 'invalid-token';

      expect(pushNotificationService.isValidFCMToken(validToken)).toBe(true);
      expect(pushNotificationService.isValidFCMToken(invalidToken)).toBe(false);
    });

    it('should validate APNs device tokens', () => {
      const validToken = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const invalidToken = 'invalid-apns-token';

      expect(pushNotificationService.isValidAPNsToken(validToken)).toBe(true);
      expect(pushNotificationService.isValidAPNsToken(invalidToken)).toBe(false);
    });

    it('should reject notifications to invalid device tokens', async () => {
      const invalidToken = 'clearly-invalid-token';
      const notification = {
        title: 'Test',
        body: 'Test message',
        data: {}
      };

      const result = await pushNotificationService.sendToDevice(invalidToken, notification, 'android');

      expect(result).toEqual({
        success: false,
        error: 'Invalid device token format'
      });
      expect(mockFCMMessaging.send).not.toHaveBeenCalled();
    });
  });

  describe('Notification Priority and Delivery Options', () => {
    it('should handle high priority notifications', async () => {
      const deviceToken = 'device-token-123';
      const notification = {
        title: 'Urgent: Account Security',
        body: 'Suspicious login detected',
        data: { alertType: 'security', priority: 'high' }
      };
      const options = {
        priority: 'high' as const,
        timeToLive: 3600,
        collapseKey: 'security-alert'
      };

      await pushNotificationService.sendToDevice(deviceToken, notification, 'android', options);

      expect(mockFCMMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({
          android: expect.objectContaining({
            priority: 'high',
            ttl: 3600000,
            collapseKey: 'security-alert'
          })
        })
      );
    });

    it('should handle silent notifications for background updates', async () => {
      const deviceToken = 'ios-device-token';
      const notification = {
        title: '',
        body: '',
        data: { backgroundUpdate: 'true', syncType: 'feed' }
      };
      const options = {
        silent: true,
        contentAvailable: true
      };

      await pushNotificationService.sendToDevice(deviceToken, notification, 'ios', options);

      expect(mockAPNProvider.send).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            aps: expect.objectContaining({
              'content-available': 1,
              sound: undefined
            })
          })
        }),
        deviceToken
      );
    });
  });
});