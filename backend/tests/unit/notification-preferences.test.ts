/**
 * Notification Preferences Service Unit Tests
 * Tests for managing user notification preferences, device tokens, and opt-out settings
 */

import { NotificationPreferencesService } from '../../src/services/notificationPreferencesService';
import { supabase } from '../../src/services/supabase';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/services/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
    data: null,
    error: null
  }
}));

jest.mock('../../src/utils/logger');

describe('NotificationPreferencesService', () => {
  let preferencesService: NotificationPreferencesService;
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = require('../../src/services/supabase').supabase;
    preferencesService = new NotificationPreferencesService();
  });

  describe('User Device Token Management', () => {
    it('should register device token for user', async () => {
      const userId = 'user-123';
      const deviceToken = 'device-token-abc';
      const platform = 'android';
      const deviceInfo = {
        deviceId: 'device-456',
        osVersion: '14.0',
        appVersion: '2.1.0',
        model: 'Pixel 8'
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'token-record-123',
          user_id: userId,
          device_token: deviceToken,
          platform,
          device_info: deviceInfo,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        error: null
      });

      const result = await preferencesService.registerDeviceToken(userId, deviceToken, platform, deviceInfo);

      expect(mockSupabase.from).toHaveBeenCalledWith('user_device_tokens');
      expect(mockSupabase.insert).toHaveBeenCalledWith({
        user_id: userId,
        device_token: deviceToken,
        platform,
        device_info: deviceInfo,
        is_active: true
      });
      expect(result).toEqual({
        success: true,
        tokenId: 'token-record-123',
        deviceToken
      });
    });

    it('should update existing device token if already registered', async () => {
      const userId = 'user-123';
      const deviceToken = 'updated-device-token';
      const platform = 'ios';

      // Mock finding existing token
      mockSupabase.select.mockReturnValueOnce({
        eq: jest.fn().mockResolvedValueOnce({
          data: [{
            id: 'existing-token-123',
            user_id: userId,
            device_token: 'old-token',
            platform,
            is_active: true
          }],
          error: null
        })
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'existing-token-123',
          device_token: deviceToken,
          updated_at: new Date()
        },
        error: null
      });

      const result = await preferencesService.registerDeviceToken(userId, deviceToken, platform);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        device_token: deviceToken,
        is_active: true,
        updated_at: expect.any(Date)
      });
      expect(result.success).toBe(true);
    });

    it('should handle device token registration errors', async () => {
      const userId = 'user-123';
      const deviceToken = 'device-token-abc';
      const platform = 'android';

      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' }
      });

      const result = await preferencesService.registerDeviceToken(userId, deviceToken, platform);

      expect(result).toEqual({
        success: false,
        error: 'Database error'
      });
      expect(logger.error).toHaveBeenCalledWith('Failed to register device token', expect.any(Object));
    });

    it('should deactivate device token', async () => {
      const tokenId = 'token-123';

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: tokenId, is_active: false },
        error: null
      });

      const result = await preferencesService.deactivateDeviceToken(tokenId);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        is_active: false,
        updated_at: expect.any(Date)
      });
      expect(result.success).toBe(true);
    });

    it('should get active device tokens for user', async () => {
      const userId = 'user-123';
      const mockTokens = [
        {
          id: 'token-1',
          device_token: 'android-token',
          platform: 'android',
          is_active: true
        },
        {
          id: 'token-2',
          device_token: 'ios-token',
          platform: 'ios',
          is_active: true
        }
      ];

      mockSupabase.eq.mockResolvedValueOnce({
        data: mockTokens,
        error: null
      });

      const result = await preferencesService.getUserDeviceTokens(userId);

      expect(mockSupabase.from).toHaveBeenCalledWith('user_device_tokens');
      expect(mockSupabase.select).toHaveBeenCalledWith('*');
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', userId);
      expect(result).toEqual(mockTokens);
    });
  });

  describe('Notification Preferences Management', () => {
    it('should create default notification preferences for new user', async () => {
      const userId = 'user-123';
      const defaultPreferences = {
        likes: true,
        comments: true,
        follows: true,
        mentions: true,
        posts_from_following: true,
        milestone_reminders: true,
        trending_content: false,
        marketing: false,
        system_updates: true
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'pref-123',
          user_id: userId,
          push_notifications: true,
          email_notifications: true,
          notification_types: defaultPreferences,
          quiet_hours: {
            enabled: false,
            start: '22:00',
            end: '08:00',
            timezone: 'UTC'
          },
          created_at: new Date(),
          updated_at: new Date()
        },
        error: null
      });

      const result = await preferencesService.createDefaultPreferences(userId);

      expect(mockSupabase.from).toHaveBeenCalledWith('notification_preferences');
      expect(mockSupabase.insert).toHaveBeenCalledWith({
        user_id: userId,
        push_notifications: true,
        email_notifications: true,
        notification_types: defaultPreferences,
        quiet_hours: expect.any(Object)
      });
      expect(result.success).toBe(true);
    });

    it('should get user notification preferences', async () => {
      const userId = 'user-123';
      const mockPreferences = {
        id: 'pref-123',
        user_id: userId,
        push_notifications: true,
        email_notifications: false,
        notification_types: {
          likes: true,
          comments: true,
          follows: false,
          mentions: true,
          posts_from_following: true,
          milestone_reminders: true,
          trending_content: false,
          marketing: false,
          system_updates: true
        },
        quiet_hours: {
          enabled: true,
          start: '22:00',
          end: '08:00',
          timezone: 'America/New_York'
        }
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockPreferences,
        error: null
      });

      const result = await preferencesService.getUserPreferences(userId);

      expect(mockSupabase.from).toHaveBeenCalledWith('notification_preferences');
      expect(mockSupabase.select).toHaveBeenCalledWith('*');
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', userId);
      expect(result).toEqual(mockPreferences);
    });

    it('should update user notification preferences', async () => {
      const userId = 'user-123';
      const updates = {
        push_notifications: false,
        notification_types: {
          likes: false,
          comments: true,
          follows: true
        },
        quiet_hours: {
          enabled: true,
          start: '23:00',
          end: '07:00',
          timezone: 'America/Los_Angeles'
        }
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'pref-123',
          user_id: userId,
          ...updates,
          updated_at: new Date()
        },
        error: null
      });

      const result = await preferencesService.updateUserPreferences(userId, updates);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        ...updates,
        updated_at: expect.any(Date)
      });
      expect(result.success).toBe(true);
    });

    it('should handle preferences update errors', async () => {
      const userId = 'user-123';
      const updates = { push_notifications: false };

      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'User not found' }
      });

      const result = await preferencesService.updateUserPreferences(userId, updates);

      expect(result).toEqual({
        success: false,
        error: 'User not found'
      });
    });
  });

  describe('Notification Type Preferences', () => {
    it('should check if user has specific notification type enabled', async () => {
      const userId = 'user-123';
      const notificationType = 'likes';

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          push_notifications: true,
          notification_types: {
            likes: true,
            comments: false,
            follows: true
          }
        },
        error: null
      });

      const result = await preferencesService.isNotificationTypeEnabled(userId, notificationType);

      expect(result).toBe(true);
    });

    it('should return false if push notifications are globally disabled', async () => {
      const userId = 'user-123';
      const notificationType = 'likes';

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          push_notifications: false,
          notification_types: {
            likes: true
          }
        },
        error: null
      });

      const result = await preferencesService.isNotificationTypeEnabled(userId, notificationType);

      expect(result).toBe(false);
    });

    it('should respect quiet hours settings', async () => {
      const userId = 'user-123';
      const currentTime = new Date('2024-01-15T23:30:00Z'); // 11:30 PM UTC

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          quiet_hours: {
            enabled: true,
            start: '22:00',
            end: '08:00',
            timezone: 'UTC'
          }
        },
        error: null
      });

      const result = await preferencesService.isInQuietHours(userId, currentTime);

      expect(result).toBe(true);
    });

    it('should handle timezone conversion for quiet hours', async () => {
      const userId = 'user-123';
      const currentTime = new Date('2024-01-15T23:30:00Z'); // 11:30 PM UTC, 6:30 PM EST

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          quiet_hours: {
            enabled: true,
            start: '22:00',
            end: '08:00',
            timezone: 'America/New_York'
          }
        },
        error: null
      });

      const result = await preferencesService.isInQuietHours(userId, currentTime);

      expect(result).toBe(false); // 6:30 PM EST is not in quiet hours (10 PM - 8 AM)
    });
  });

  describe('Topic Subscription Management', () => {
    it('should manage user topic subscriptions', async () => {
      const userId = 'user-123';
      const topics = ['trending-content', 'milestone-reminders', 'community-updates'];

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'sub-123',
          user_id: userId,
          subscribed_topics: topics,
          updated_at: new Date()
        },
        error: null
      });

      const result = await preferencesService.updateTopicSubscriptions(userId, topics);

      expect(mockSupabase.from).toHaveBeenCalledWith('user_topic_subscriptions');
      expect(result.success).toBe(true);
      expect(result.subscribedTopics).toEqual(topics);
    });

    it('should get user topic subscriptions', async () => {
      const userId = 'user-123';
      const subscribedTopics = ['milestone-reminders', 'community-updates'];

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          subscribed_topics: subscribedTopics
        },
        error: null
      });

      const result = await preferencesService.getUserTopicSubscriptions(userId);

      expect(result).toEqual(subscribedTopics);
    });

    it('should subscribe user to specific topic', async () => {
      const userId = 'user-123';
      const topic = 'trending-content';

      // Mock current subscriptions
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          subscribed_topics: ['milestone-reminders']
        },
        error: null
      });

      // Mock update
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          subscribed_topics: ['milestone-reminders', topic]
        },
        error: null
      });

      const result = await preferencesService.subscribeToTopic(userId, topic);

      expect(result.success).toBe(true);
      expect(result.subscribedTopics).toContain(topic);
    });

    it('should unsubscribe user from specific topic', async () => {
      const userId = 'user-123';
      const topic = 'trending-content';

      // Mock current subscriptions
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          subscribed_topics: ['milestone-reminders', 'trending-content']
        },
        error: null
      });

      // Mock update
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          subscribed_topics: ['milestone-reminders']
        },
        error: null
      });

      const result = await preferencesService.unsubscribeFromTopic(userId, topic);

      expect(result.success).toBe(true);
      expect(result.subscribedTopics).not.toContain(topic);
    });
  });

  describe('Global Opt-out Management', () => {
    it('should allow user to opt out of all notifications', async () => {
      const userId = 'user-123';

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'pref-123',
          push_notifications: false,
          email_notifications: false,
          opted_out: true,
          opted_out_at: new Date()
        },
        error: null
      });

      const result = await preferencesService.optOutOfAllNotifications(userId);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        push_notifications: false,
        email_notifications: false,
        opted_out: true,
        opted_out_at: expect.any(Date),
        updated_at: expect.any(Date)
      });
      expect(result.success).toBe(true);
    });

    it('should allow user to opt back in to notifications', async () => {
      const userId = 'user-123';

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'pref-123',
          push_notifications: true,
          email_notifications: true,
          opted_out: false,
          opted_out_at: null
        },
        error: null
      });

      const result = await preferencesService.optInToNotifications(userId);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        push_notifications: true,
        email_notifications: true,
        opted_out: false,
        opted_out_at: null,
        updated_at: expect.any(Date)
      });
      expect(result.success).toBe(true);
    });

    it('should check if user has opted out globally', async () => {
      const userId = 'user-123';

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          opted_out: true,
          opted_out_at: new Date('2024-01-01')
        },
        error: null
      });

      const result = await preferencesService.hasOptedOut(userId);

      expect(result).toBe(true);
    });
  });

  describe('Preference Validation', () => {
    it('should validate notification preference updates', () => {
      const validUpdates = {
        push_notifications: true,
        notification_types: {
          likes: true,
          comments: false
        },
        quiet_hours: {
          enabled: true,
          start: '22:00',
          end: '08:00',
          timezone: 'UTC'
        }
      };

      const result = preferencesService.validatePreferencesUpdate(validUpdates);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid notification preference updates', () => {
      const invalidUpdates = {
        push_notifications: 'invalid', // Should be boolean
        notification_types: {
          invalid_type: true // Unknown notification type
        },
        quiet_hours: {
          enabled: true,
          start: '25:00', // Invalid time format
          end: '08:00',
          timezone: 'Invalid/Timezone'
        }
      };

      const result = preferencesService.validatePreferencesUpdate(invalidUpdates);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('push_notifications must be a boolean');
      expect(result.errors).toContain('Invalid quiet hours start time');
      expect(result.errors).toContain('Invalid timezone');
    });

    it('should validate device token format by platform', () => {
      expect(preferencesService.validateDeviceToken('valid-fcm-token-format', 'android')).toBe(true);
      expect(preferencesService.validateDeviceToken('invalid', 'android')).toBe(false);
      expect(preferencesService.validateDeviceToken('64-char-hex-string-for-apns-token-validation-test-purpose', 'ios')).toBe(true);
      expect(preferencesService.validateDeviceToken('short', 'ios')).toBe(false);
    });
  });
});