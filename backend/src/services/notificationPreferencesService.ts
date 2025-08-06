/**
 * Notification Preferences Service
 * Manages user notification preferences, device tokens, and opt-out settings
 */

import { supabase } from './supabase';
import { logger } from '../utils/logger';

export interface DeviceTokenInfo {
  deviceId?: string;
  osVersion?: string;
  appVersion?: string;
  model?: string;
}

export interface NotificationTypes {
  likes: boolean;
  comments: boolean;
  follows: boolean;
  mentions: boolean;
  posts_from_following: boolean;
  milestone_reminders: boolean;
  trending_content: boolean;
  marketing: boolean;
  system_updates: boolean;
  [key: string]: boolean;
}

export interface QuietHours {
  enabled: boolean;
  start: string; // HH:MM format
  end: string; // HH:MM format
  timezone: string;
}

export interface NotificationPreferences {
  id?: string;
  user_id: string;
  push_notifications: boolean;
  email_notifications: boolean;
  notification_types: NotificationTypes;
  quiet_hours: QuietHours;
  opted_out?: boolean;
  opted_out_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface DeviceToken {
  id: string;
  user_id: string;
  device_token: string;
  platform: 'android' | 'ios' | 'web';
  device_info?: DeviceTokenInfo;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PreferencesResult {
  success: boolean;
  error?: string;
  data?: any;
}

export interface DeviceTokenResult {
  success: boolean;
  error?: string;
  tokenId?: string;
  deviceToken?: string;
}

export interface TopicSubscriptionResult {
  success: boolean;
  error?: string;
  subscribedTopics?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class NotificationPreferencesService {
  private readonly DEFAULT_NOTIFICATION_TYPES: NotificationTypes = {
    likes: true,
    comments: true,
    follows: true,
    mentions: true,
    posts_from_following: true,
    milestone_reminders: true,
    trending_content: false,
    marketing: false,
    system_updates: true,
  };

  private readonly DEFAULT_QUIET_HOURS: QuietHours = {
    enabled: false,
    start: '22:00',
    end: '08:00',
    timezone: 'UTC',
  };

  private readonly VALID_NOTIFICATION_TYPES = [
    'likes',
    'comments',
    'follows',
    'mentions',
    'posts_from_following',
    'milestone_reminders',
    'trending_content',
    'marketing',
    'system_updates',
  ];

  /**
   * Device Token Management
   */

  public async registerDeviceToken(
    userId: string,
    deviceToken: string,
    platform: 'android' | 'ios' | 'web',
    deviceInfo?: DeviceTokenInfo
  ): Promise<DeviceTokenResult> {
    try {
      // Validate device token format
      if (!this.validateDeviceToken(deviceToken, platform)) {
        return {
          success: false,
          error: `Invalid ${platform} device token format`,
        };
      }

      // Check if device token already exists for this user
      const existingToken = await this.findExistingDeviceToken(userId, platform, deviceInfo?.deviceId);

      if (existingToken) {
        // Update existing token
        const { data, error } = await supabase
          .from('user_device_tokens')
          .update({
            device_token: deviceToken,
            device_info: deviceInfo,
            is_active: true,
            updated_at: new Date(),
          })
          .eq('id', existingToken.id)
          .single();

        if (error) {
          logger.error('Failed to update device token', {
            userId,
            platform,
            error: error.message,
          });
          return { success: false, error: error.message };
        }

        return {
          success: true,
          tokenId: existingToken.id,
          deviceToken,
        };
      } else {
        // Create new token record
        const { data, error } = await supabase
          .from('user_device_tokens')
          .insert({
            user_id: userId,
            device_token: deviceToken,
            platform,
            device_info: deviceInfo,
            is_active: true,
          })
          .single();

        if (error) {
          logger.error('Failed to register device token', {
            userId,
            platform,
            error: error.message,
          });
          return { success: false, error: error.message };
        }

        return {
          success: true,
          tokenId: data.id,
          deviceToken,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to register device token', {
        userId,
        platform,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  public async deactivateDeviceToken(tokenId: string): Promise<PreferencesResult> {
    try {
      const { data, error } = await supabase
        .from('user_device_tokens')
        .update({
          is_active: false,
          updated_at: new Date(),
        })
        .eq('id', tokenId)
        .single();

      if (error) {
        logger.error('Failed to deactivate device token', {
          tokenId,
          error: error.message,
        });
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to deactivate device token', {
        tokenId,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  public async getUserDeviceTokens(userId: string): Promise<DeviceToken[]> {
    try {
      const { data, error } = await supabase
        .from('user_device_tokens')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) {
        logger.error('Failed to get user device tokens', {
          userId,
          error: error.message,
        });
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('Failed to get user device tokens', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Notification Preferences Management
   */

  public async createDefaultPreferences(userId: string): Promise<PreferencesResult> {
    try {
      const defaultPreferences: Partial<NotificationPreferences> = {
        user_id: userId,
        push_notifications: true,
        email_notifications: true,
        notification_types: this.DEFAULT_NOTIFICATION_TYPES,
        quiet_hours: this.DEFAULT_QUIET_HOURS,
      };

      const { data, error } = await supabase
        .from('notification_preferences')
        .insert(defaultPreferences)
        .single();

      if (error) {
        logger.error('Failed to create default preferences', {
          userId,
          error: error.message,
        });
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create default preferences', {
        userId,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  public async getUserPreferences(userId: string): Promise<NotificationPreferences | null> {
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No preferences found, create defaults
          const createResult = await this.createDefaultPreferences(userId);
          if (createResult.success && createResult.data) {
            return createResult.data;
          }
        }
        
        logger.error('Failed to get user preferences', {
          userId,
          error: error.message,
        });
        return null;
      }

      return data;
    } catch (error) {
      logger.error('Failed to get user preferences', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  public async updateUserPreferences(
    userId: string,
    updates: Partial<NotificationPreferences>
  ): Promise<PreferencesResult> {
    try {
      // Validate updates
      const validation = this.validatePreferencesUpdate(updates);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
        };
      }

      const { data, error } = await supabase
        .from('notification_preferences')
        .update({
          ...updates,
          updated_at: new Date(),
        })
        .eq('user_id', userId)
        .single();

      if (error) {
        logger.error('Failed to update user preferences', {
          userId,
          error: error.message,
        });
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update user preferences', {
        userId,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Notification Type Preferences
   */

  public async isNotificationTypeEnabled(userId: string, notificationType: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('push_notifications, notification_types')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return false;
      }

      // Check global push notifications setting
      if (!data.push_notifications) {
        return false;
      }

      // Check specific notification type
      const notificationTypes = data.notification_types || {};
      return notificationTypes[notificationType] === true;
    } catch (error) {
      logger.error('Failed to check notification type preference', {
        userId,
        notificationType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  public async isInQuietHours(userId: string, currentTime: Date = new Date()): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('quiet_hours')
        .eq('user_id', userId)
        .single();

      if (error || !data?.quiet_hours?.enabled) {
        return false;
      }

      const quietHours = data.quiet_hours;
      
      // Convert current time to user's timezone
      const userTime = this.convertToTimezone(currentTime, quietHours.timezone);
      const currentHour = userTime.getHours();
      const currentMinute = userTime.getMinutes();
      const currentTimeMinutes = currentHour * 60 + currentMinute;

      // Parse quiet hours
      const startParts = quietHours.start.split(':');
      const endParts = quietHours.end.split(':');
      const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
      const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

      // Handle overnight quiet hours (e.g., 22:00 to 08:00)
      if (startMinutes > endMinutes) {
        return currentTimeMinutes >= startMinutes || currentTimeMinutes <= endMinutes;
      } else {
        return currentTimeMinutes >= startMinutes && currentTimeMinutes <= endMinutes;
      }
    } catch (error) {
      logger.error('Failed to check quiet hours', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Topic Subscription Management
   */

  public async updateTopicSubscriptions(userId: string, topics: string[]): Promise<TopicSubscriptionResult> {
    try {
      const { data, error } = await supabase
        .from('user_topic_subscriptions')
        .upsert({
          user_id: userId,
          subscribed_topics: topics,
          updated_at: new Date(),
        })
        .single();

      if (error) {
        logger.error('Failed to update topic subscriptions', {
          userId,
          topics,
          error: error.message,
        });
        return { success: false, error: error.message };
      }

      return {
        success: true,
        subscribedTopics: topics,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update topic subscriptions', {
        userId,
        topics,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  public async getUserTopicSubscriptions(userId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('user_topic_subscriptions')
        .select('subscribed_topics')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No subscriptions found
          return [];
        }
        logger.error('Failed to get user topic subscriptions', {
          userId,
          error: error.message,
        });
        return [];
      }

      return data?.subscribed_topics || [];
    } catch (error) {
      logger.error('Failed to get user topic subscriptions', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  public async subscribeToTopic(userId: string, topic: string): Promise<TopicSubscriptionResult> {
    try {
      const currentTopics = await this.getUserTopicSubscriptions(userId);
      if (!currentTopics.includes(topic)) {
        const updatedTopics = [...currentTopics, topic];
        return await this.updateTopicSubscriptions(userId, updatedTopics);
      }
      
      return {
        success: true,
        subscribedTopics: currentTopics,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to subscribe to topic', {
        userId,
        topic,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  public async unsubscribeFromTopic(userId: string, topic: string): Promise<TopicSubscriptionResult> {
    try {
      const currentTopics = await this.getUserTopicSubscriptions(userId);
      const updatedTopics = currentTopics.filter(t => t !== topic);
      return await this.updateTopicSubscriptions(userId, updatedTopics);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to unsubscribe from topic', {
        userId,
        topic,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Global Opt-out Management
   */

  public async optOutOfAllNotifications(userId: string): Promise<PreferencesResult> {
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .update({
          push_notifications: false,
          email_notifications: false,
          opted_out: true,
          opted_out_at: new Date(),
          updated_at: new Date(),
        })
        .eq('user_id', userId)
        .single();

      if (error) {
        logger.error('Failed to opt out of notifications', {
          userId,
          error: error.message,
        });
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to opt out of notifications', {
        userId,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  public async optInToNotifications(userId: string): Promise<PreferencesResult> {
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .update({
          push_notifications: true,
          email_notifications: true,
          opted_out: false,
          opted_out_at: null,
          updated_at: new Date(),
        })
        .eq('user_id', userId)
        .single();

      if (error) {
        logger.error('Failed to opt in to notifications', {
          userId,
          error: error.message,
        });
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to opt in to notifications', {
        userId,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  public async hasOptedOut(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('opted_out')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return false;
      }

      return data.opted_out === true;
    } catch (error) {
      logger.error('Failed to check opt-out status', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Validation Methods
   */

  public validatePreferencesUpdate(updates: any): ValidationResult {
    const errors: string[] = [];

    if (updates.push_notifications !== undefined) {
      if (typeof updates.push_notifications !== 'boolean') {
        errors.push('push_notifications must be a boolean');
      }
    }

    if (updates.email_notifications !== undefined) {
      if (typeof updates.email_notifications !== 'boolean') {
        errors.push('email_notifications must be a boolean');
      }
    }

    if (updates.notification_types !== undefined) {
      const notificationTypes = updates.notification_types;
      for (const [type, enabled] of Object.entries(notificationTypes)) {
        if (!this.VALID_NOTIFICATION_TYPES.includes(type)) {
          errors.push(`Unknown notification type: ${type}`);
        }
        if (typeof enabled !== 'boolean') {
          errors.push(`${type} must be a boolean`);
        }
      }
    }

    if (updates.quiet_hours !== undefined) {
      const quietHours = updates.quiet_hours;
      if (quietHours.enabled !== undefined && typeof quietHours.enabled !== 'boolean') {
        errors.push('quiet_hours.enabled must be a boolean');
      }
      if (quietHours.start && !this.isValidTimeFormat(quietHours.start)) {
        errors.push('Invalid quiet hours start time');
      }
      if (quietHours.end && !this.isValidTimeFormat(quietHours.end)) {
        errors.push('Invalid quiet hours end time');
      }
      if (quietHours.timezone && !this.isValidTimezone(quietHours.timezone)) {
        errors.push('Invalid timezone');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  public validateDeviceToken(token: string, platform: 'android' | 'ios' | 'web'): boolean {
    if (platform === 'ios') {
      // APNs tokens are 64 hex characters
      return token.length === 64 && /^[0-9a-fA-F]{64}$/.test(token);
    } else {
      // FCM tokens are typically 152+ characters, base64url encoded
      return token.length >= 100 && /^[A-Za-z0-9_-]+$/.test(token);
    }
  }

  /**
   * Private helper methods
   */

  private async findExistingDeviceToken(
    userId: string,
    platform: string,
    deviceId?: string
  ): Promise<DeviceToken | null> {
    try {
      let query = supabase
        .from('user_device_tokens')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', platform);

      if (deviceId) {
        // If deviceId is provided, look for tokens with matching device info
        query = query.contains('device_info', { deviceId });
      }

      const { data, error } = await query.eq('is_active', true);

      if (error || !data?.length) {
        return null;
      }

      return data[0];
    } catch (error) {
      logger.error('Failed to find existing device token', {
        userId,
        platform,
        deviceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  private convertToTimezone(date: Date, timezone: string): Date {
    try {
      return new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    } catch (error) {
      logger.warn('Invalid timezone, using UTC', { timezone });
      return new Date(date.toUTCString());
    }
  }

  private isValidTimeFormat(time: string): boolean {
    return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
  }

  private isValidTimezone(timezone: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }
}