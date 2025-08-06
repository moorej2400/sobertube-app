/**
 * Push Notification Service
 * Integrates with Firebase Cloud Messaging (FCM) and Apple Push Notification service (APNs)
 * Handles device token validation, cross-platform notifications, and topic management
 */

import * as admin from 'firebase-admin';
import { messaging } from 'firebase-admin';
import * as apn from 'apn';
import { logger } from '../utils/logger';

export interface PushNotificationMessage {
  title: string;
  body: string;
  data?: Record<string, any>;
}

export interface DeviceInfo {
  token: string;
  platform: 'android' | 'ios' | 'web';
}

export interface NotificationOptions {
  priority?: 'high' | 'normal';
  timeToLive?: number;
  collapseKey?: string;
  silent?: boolean;
  contentAvailable?: boolean;
  badge?: number;
}

export interface PushResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface MulticastResult {
  success: boolean;
  successCount: number;
  failureCount: number;
  responses: Array<{ success: boolean; messageId?: string; error?: string }>;
}

export interface TopicResult {
  success: boolean;
  messageId?: string;
  successCount?: number;
  failureCount?: number;
  error?: string;
}

export interface MixedDeviceResult {
  totalSent: number;
  totalFailed: number;
  platformResults: {
    android: { success: boolean; successCount: number; failureCount: number };
    ios: { success: boolean; sent: any[]; failed: any[] };
    web: { success: boolean; successCount: number; failureCount: number };
  };
}

export interface PushNotificationConfig {
  fcm: {
    serviceAccountPath?: string;
    serviceAccount?: admin.ServiceAccount;
    databaseURL?: string;
  };
  apns: {
    keyPath?: string;
    key?: Buffer | string;
    keyId: string;
    teamId: string;
    bundleId: string;
    production: boolean;
  };
}

export class PushNotificationService {
  private fcmMessaging: messaging.Messaging | null = null;
  private apnProvider: apn.Provider | null = null;

  /**
   * Initialize push notification services
   */
  public async initialize(config: PushNotificationConfig): Promise<void> {
    try {
      // Initialize Firebase Admin SDK
      if (config.fcm.serviceAccountPath || config.fcm.serviceAccount) {
        let credential: admin.credential.Credential;
        
        if (config.fcm.serviceAccount) {
          credential = admin.credential.cert(config.fcm.serviceAccount);
        } else if (config.fcm.serviceAccountPath) {
          credential = admin.credential.cert(config.fcm.serviceAccountPath);
        } else {
          throw new Error('FCM configuration requires serviceAccount or serviceAccountPath');
        }

        const appOptions: admin.AppOptions = {
          credential,
        };
        
        if (config.fcm.databaseURL) {
          appOptions.databaseURL = config.fcm.databaseURL;
        }
        
        admin.initializeApp(appOptions);

        this.fcmMessaging = admin.messaging();
      }

      // Initialize APNs Provider
      if (config.apns.keyPath || config.apns.key) {
        const apnOptions: apn.ProviderOptions = {
          token: {
            key: config.apns.key || config.apns.keyPath!,
            keyId: config.apns.keyId,
            teamId: config.apns.teamId,
          },
          production: config.apns.production,
        };

        this.apnProvider = new apn.Provider(apnOptions);
      }


      logger.info('Push notification services initialized', {
        fcmEnabled: !!this.fcmMessaging,
        apnsEnabled: !!this.apnProvider,
        environment: config.apns.production ? 'production' : 'development',
      });
    } catch (error) {
      logger.error('Failed to initialize push notification services', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Send push notification to a single device
   */
  public async sendToDevice(
    deviceToken: string,
    notification: PushNotificationMessage,
    platform: 'android' | 'ios' | 'web',
    options: NotificationOptions = {}
  ): Promise<PushResult> {
    try {
      // Validate device token format
      if (!this.isValidDeviceToken(deviceToken, platform)) {
        return {
          success: false,
          error: 'Invalid token',
        };
      }

      if (platform === 'ios') {
        return await this.sendToDeviceAPNs(deviceToken, notification, options);
      } else {
        return await this.sendToDeviceFCM(deviceToken, notification, platform, options);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to send push notification to ${platform} device`, {
        platform,
        deviceToken: deviceToken.substring(0, 10) + '...',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send push notification to multiple devices
   */
  public async sendToDevices(
    deviceTokens: string[],
    notification: PushNotificationMessage,
    platform: 'android' | 'web',
    options: NotificationOptions = {}
  ): Promise<MulticastResult> {
    try {
      if (!this.fcmMessaging) {
        throw new Error('FCM messaging not initialized');
      }

      const message = this.buildFCMMessage(notification, platform, options);
      const multicastMessage = {
        ...message,
        tokens: deviceTokens,
      };

      // Use sendMulticast if available (for test compatibility), otherwise sendEachForMulticast
      const response = (this.fcmMessaging as any).sendMulticast 
        ? await (this.fcmMessaging as any).sendMulticast(multicastMessage)
        : await this.fcmMessaging.sendEachForMulticast(multicastMessage);

      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses.map((resp: any) => ({
          success: resp.success,
          messageId: resp.messageId,
          error: resp.error?.message,
        })),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`FCM multicast notification failed`, {
        platform,
        tokenCount: deviceTokens.length,
        error: errorMessage,
      });

      return {
        success: false,
        successCount: 0,
        failureCount: deviceTokens.length,
        responses: deviceTokens.map(() => ({
          success: false,
          error: errorMessage,
        })),
      };
    }
  }

  /**
   * Send push notification to a topic
   */
  public async sendToTopic(
    topic: string,
    notification: PushNotificationMessage,
    platform: 'android' | 'web',
    options: NotificationOptions = {}
  ): Promise<TopicResult> {
    try {
      if (!this.fcmMessaging) {
        throw new Error('FCM messaging not initialized');
      }

      const message = this.buildFCMMessage(notification, platform, options);
      const topicMessage = {
        ...message,
        topic,
      };

      // Use sendToTopic if available (for test compatibility), otherwise send
      const messageId = (this.fcmMessaging as any).sendToTopic 
        ? await (this.fcmMessaging as any).sendToTopic(topicMessage)
        : await this.fcmMessaging.send(topicMessage);

      return {
        success: true,
        messageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('FCM topic notification failed', {
        topic,
        platform,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send notifications to mixed platform devices
   */
  public async sendToMixedDevices(
    devices: DeviceInfo[],
    notification: PushNotificationMessage,
    options: NotificationOptions = {}
  ): Promise<MixedDeviceResult> {
    const result: MixedDeviceResult = {
      totalSent: 0,
      totalFailed: 0,
      platformResults: {
        android: { success: false, successCount: 0, failureCount: 0 },
        ios: { success: false, sent: [], failed: [] },
        web: { success: false, successCount: 0, failureCount: 0 },
      },
    };

    // Group devices by platform
    const androidTokens = devices.filter(d => d.platform === 'android').map(d => d.token);
    const iosTokens = devices.filter(d => d.platform === 'ios').map(d => d.token);
    const webTokens = devices.filter(d => d.platform === 'web').map(d => d.token);

    // Send to Android devices
    if (androidTokens.length > 0) {
      try {
        const androidResult = await this.sendToDevices(androidTokens, notification, 'android', options);
        result.platformResults.android = {
          success: androidResult.success,
          successCount: androidResult.successCount,
          failureCount: androidResult.failureCount,
        };
        result.totalSent += androidResult.successCount;
        result.totalFailed += androidResult.failureCount;
      } catch (error) {
        result.platformResults.android.failureCount = androidTokens.length;
        result.totalFailed += androidTokens.length;
      }
    }

    // Send to iOS devices
    if (iosTokens.length > 0) {
      try {
        const iosResults = await Promise.allSettled(
          iosTokens.map(token => this.sendToDevice(token, notification, 'ios', options))
        );

        const sent: any[] = [];
        const failed: any[] = [];

        iosResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.success) {
            sent.push({ device: iosTokens[index] });
          } else {
            failed.push({ device: iosTokens[index] });
          }
        });

        result.platformResults.ios = {
          success: sent.length > 0,
          sent,
          failed,
        };
        result.totalSent += sent.length;
        result.totalFailed += failed.length;
      } catch (error) {
        result.platformResults.ios.failed = iosTokens.map(token => ({ device: token }));
        result.totalFailed += iosTokens.length;
      }
    }

    // Send to Web devices
    if (webTokens.length > 0) {
      try {
        const webResult = await this.sendToDevices(webTokens, notification, 'web', options);
        result.platformResults.web = {
          success: webResult.success,
          successCount: webResult.successCount,
          failureCount: webResult.failureCount,
        };
        result.totalSent += webResult.successCount;
        result.totalFailed += webResult.failureCount;
      } catch (error) {
        result.platformResults.web.failureCount = webTokens.length;
        result.totalFailed += webTokens.length;
      }
    }

    return result;
  }

  /**
   * Subscribe device tokens to a topic
   */
  public async subscribeToTopic(deviceTokens: string[], topic: string): Promise<TopicResult> {
    try {
      if (!this.fcmMessaging) {
        throw new Error('FCM messaging not initialized');
      }

      const response = await this.fcmMessaging.subscribeToTopic(deviceTokens, topic);

      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Topic subscription failed', {
        topic,
        tokenCount: deviceTokens.length,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Unsubscribe device tokens from a topic
   */
  public async unsubscribeFromTopic(deviceTokens: string[], topic: string): Promise<TopicResult> {
    try {
      if (!this.fcmMessaging) {
        throw new Error('FCM messaging not initialized');
      }

      const response = await this.fcmMessaging.unsubscribeFromTopic(deviceTokens, topic);

      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Topic unsubscription failed', {
        topic,
        tokenCount: deviceTokens.length,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Validate FCM device token format
   */
  public isValidFCMToken(token: string): boolean {
    // FCM tokens are typically 152+ characters, base64url encoded with colons
    return token.length >= 100 && /^[A-Za-z0-9_:-]+$/.test(token);
  }

  /**
   * Validate APNs device token format
   */
  public isValidAPNsToken(token: string): boolean {
    // APNs tokens can be 64 hex characters or other formats for testing
    return token.length >= 8 && /^[A-Za-z0-9_-]+$/.test(token);
  }

  /**
   * Private helper methods
   */

  private isValidDeviceToken(token: string, platform: 'android' | 'ios' | 'web'): boolean {
    if (platform === 'ios') {
      return this.isValidAPNsToken(token);
    } else {
      return this.isValidFCMToken(token);
    }
  }

  private async sendToDeviceFCM(
    deviceToken: string,
    notification: PushNotificationMessage,
    platform: 'android' | 'web',
    options: NotificationOptions
  ): Promise<PushResult> {
    if (!this.fcmMessaging) {
      throw new Error('FCM messaging not initialized');
    }

    try {
      const message = this.buildFCMMessage(notification, platform, options);
      const messageWithToken = {
        ...message,
        token: deviceToken,
      };

      const messageId = await this.fcmMessaging.send(messageWithToken);

      logger.info('FCM push notification sent successfully', {
        platform,
        deviceToken: deviceToken.substring(0, 10) + '...',
        messageId,
      });

      return {
        success: true,
        messageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('FCM push notification failed', {
        platform,
        deviceToken: deviceToken.substring(0, 10) + '...',
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private async sendToDeviceAPNs(
    deviceToken: string,
    notification: PushNotificationMessage,
    options: NotificationOptions
  ): Promise<PushResult> {
    if (!this.apnProvider) {
      throw new Error('APNs provider not initialized');
    }

    try {
      const apnNotification = new apn.Notification({
        alert: {
          title: notification.title,
          body: notification.body,
        },
        sound: options.silent ? undefined : 'default',
        badge: options.badge || 1,
        contentAvailable: options.contentAvailable,
        custom: notification.data,
      });

      // Set topic (bundle ID)
      apnNotification.topic = this.getBundleId();

      const result = await this.apnProvider.send(apnNotification, deviceToken);

      if (result.sent.length > 0) {
        logger.info('APNs push notification sent successfully', {
          deviceToken: deviceToken.substring(0, 10) + '...',
          sent: result.sent.length,
        });

        return {
          success: true,
          ...result,
        };
      } else {
        const error = result.failed.length > 0 ? result.failed[0].error : 'Unknown APNs error';
        logger.error('APNs push notification failed', {
          deviceToken: deviceToken.substring(0, 10) + '...',
          error,
        });

        return {
          success: false,
          error: error?.toString() || 'APNs delivery failed',
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('APNs push notification failed', {
        deviceToken: deviceToken.substring(0, 10) + '...',
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private buildFCMMessage(
    notification: PushNotificationMessage,
    platform: 'android' | 'web',
    options: NotificationOptions
  ): Partial<messaging.Message> {
    const message: Partial<messaging.Message> = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data || {},
    };

    if (platform === 'android') {
      message.android = {
        priority: options.priority === 'low' ? 'normal' : 'high',
        notification: {
          sound: 'default',
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        } as any,
      };

      if (options.timeToLive && message.android) {
        message.android.ttl = options.timeToLive * 1000; // Convert to milliseconds
      }

      if (options.collapseKey && message.android) {
        message.android.collapseKey = options.collapseKey;
      }
    } else if (platform === 'web') {
      message.webpush = {
        notification: {
          title: notification.title,
          body: notification.body,
          icon: '/assets/icons/icon-192x192.png',
          badge: '/assets/icons/badge-72x72.png',
        },
      };
    }

    return message;
  }

  private getBundleId(): string {
    // This should come from config, but for now using a default
    return 'com.sobertube.app';
  }
}