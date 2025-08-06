/**
 * Notification Scheduler Service
 * Handles scheduling, batching, queuing, and delayed delivery of notifications
 */

import { createClient, RedisClientType } from 'redis';
import { PushNotificationService } from './pushNotificationService';
import { NotificationPreferencesService } from './notificationPreferencesService';
import { NotificationTemplateService } from './notificationTemplateService';
import { logger } from '../utils/logger';

export interface ScheduledNotification {
  id: string;
  userId: string;
  templateId: string;
  variables: Record<string, any>;
  priority: 'low' | 'normal' | 'high';
  scheduledFor: Date;
  retryCount?: number;
  maxRetries?: number;
  overrideQuietHours?: boolean;
  batchable?: boolean;
  metadata?: Record<string, any>;
}

export interface ScheduleResult {
  success: boolean;
  notificationId: string;
  scheduledFor: Date;
  error?: string;
  delayed?: boolean;
  delayReason?: string;
  skipped?: boolean;
  skipReason?: string;
  batched?: boolean;
  batchWindowEnd?: Date;
  rateLimited?: boolean;
  retryCount?: number;
  finalAttempt?: boolean;
  bypassedRateLimit?: boolean;
}

export interface BatchScheduleResult {
  totalScheduled: number;
  totalBatched: number;
  totalSkipped: number;
  batchGroups: BatchGroup[];
  results: ScheduleResult[];
}

export interface BatchGroup {
  userId: string;
  templateId: string;
  notifications: ScheduledNotification[];
  batchKey: string;
}

export interface ProcessResult {
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
}

export interface BatchProcessResult {
  success: boolean;
  notificationsSent: number;
  originalCount: number;
  error?: string;
}

export interface QueueStats {
  mainQueue: number;
  priorityQueue: number;
  delayedQueue: number;
  totalPending: number;
}

export interface BatchingOptions {
  enabled: boolean;
  windowMs: number;
  maxBatchSize: number;
  batchSimilarTypes: boolean;
}

export interface RateLimitOptions {
  perUser: {
    perMinute: number;
    perHour: number;
    perDay: number;
    allowHighPriorityBypass?: boolean;
  };
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  processedCount: number;
  errorCount: number;
  queueSizes: QueueStats;
  lastProcessedAt?: Date;
  averageProcessingTime: number;
}

export class NotificationScheduler {
  private redisClient: RedisClientType;
  private templateService: NotificationTemplateService;
  private isRunning = false;
  private processingInterval?: NodeJS.Timeout;
  private startTime: Date;
  private processedCount = 0;
  private errorCount = 0;
  private totalProcessingTime = 0;
  private lastProcessedAt?: Date;

  private batchingOptions: BatchingOptions = {
    enabled: true,
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxBatchSize: 10,
    batchSimilarTypes: true,
  };

  private rateLimits: RateLimitOptions = {
    perUser: {
      perMinute: 10,
      perHour: 200,
      perDay: 1000,
      allowHighPriorityBypass: true,
    },
  };

  private readonly QUEUE_NAMES = {
    MAIN: 'notifications:queue',
    PRIORITY: 'notifications:priority_queue',
    DELAYED: 'notifications:delayed',
  };

  private readonly RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff
  private readonly DEFAULT_MAX_RETRIES = 3;

  constructor(
    private pushService: PushNotificationService,
    private preferencesService: NotificationPreferencesService,
    redisUrl?: string
  ) {
    this.redisClient = createClient({ url: redisUrl || 'redis://localhost:6379' });
    this.templateService = new NotificationTemplateService();
    this.templateService.loadDefaultTemplates();
    this.startTime = new Date();
  }

  /**
   * Initialize the scheduler
   */
  public async initialize(): Promise<void> {
    try {
      await this.redisClient.connect();
      logger.info('Notification scheduler initialized', {
        redisConnected: this.redisClient.isReady,
        batchingEnabled: this.batchingOptions.enabled,
        rateLimitsEnabled: true,
      });
    } catch (error) {
      logger.error('Failed to initialize notification scheduler', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Start the scheduler background processing
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.processingInterval = setInterval(async () => {
      await this.processQueues();
    }, 30000); // Process every 30 seconds

    logger.info('Notification scheduler started', {
      processingInterval: 30000,
      batchingEnabled: this.batchingOptions.enabled,
    });
  }

  /**
   * Stop the scheduler
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    await this.redisClient.disconnect();
    
    logger.info('Notification scheduler stopped', {
      totalProcessed: this.processedCount,
      totalErrors: this.errorCount,
      uptime: Date.now() - this.startTime.getTime(),
    });
  }

  /**
   * Schedule a single notification
   */
  public async scheduleNotification(notification: ScheduledNotification): Promise<ScheduleResult> {
    const startTime = Date.now();

    try {
      // Check if user has notification type enabled
      const notificationType = this.getNotificationTypeFromTemplate(notification.templateId);
      const typeEnabled = await this.preferencesService.isNotificationTypeEnabled(
        notification.userId,
        notificationType
      );

      if (!typeEnabled) {
        return {
          success: true,
          notificationId: notification.id,
          scheduledFor: notification.scheduledFor,
          skipped: true,
          skipReason: 'notification_type_disabled',
        };
      }

      // Check rate limits
      if (await this.isRateLimited(notification)) {
        return {
          success: true,
          notificationId: notification.id,
          scheduledFor: notification.scheduledFor,
          skipped: true,
          skipReason: 'rate_limited',
          rateLimited: true,
        };
      }

      // Handle immediate vs delayed scheduling
      const now = new Date();
      const isImmediate = notification.scheduledFor.getTime() <= now.getTime();

      if (isImmediate) {
        return await this.scheduleImmediateNotification(notification);
      } else {
        return await this.scheduleDelayedNotification(notification);
      }
    } catch (error) {
      this.errorCount++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to schedule notification', {
        notificationId: notification.id,
        userId: notification.userId,
        templateId: notification.templateId,
        error: errorMessage,
      });

      return {
        success: false,
        notificationId: notification.id,
        scheduledFor: notification.scheduledFor,
        error: errorMessage,
      };
    } finally {
      const processingTime = Date.now() - startTime;
      this.totalProcessingTime += processingTime;
      this.lastProcessedAt = new Date();
    }
  }

  /**
   * Schedule multiple notifications with batching
   */
  public async batchScheduleNotifications(
    notifications: ScheduledNotification[]
  ): Promise<BatchScheduleResult> {
    const results: ScheduleResult[] = [];
    const batchGroups: BatchGroup[] = [];
    let totalBatched = 0;
    let totalSkipped = 0;

    // Group notifications for potential batching
    const grouped = this.groupNotificationsForBatching(notifications);

    for (const group of grouped) {
      if (group.notifications.length > 1 && this.canBatchGroup(group)) {
        // Process as batch
        const batchResult = await this.processBatchGroup(group);
        results.push(...batchResult.results);
        batchGroups.push(group);
        totalBatched += group.notifications.length;
      } else {
        // Process individually
        for (const notification of group.notifications) {
          const result = await this.scheduleNotification(notification);
          results.push(result);
          if (result.skipped) totalSkipped++;
        }
      }
    }

    return {
      totalScheduled: notifications.length,
      totalBatched,
      totalSkipped,
      batchGroups,
      results,
    };
  }

  /**
   * Add notification to queue
   */
  public async enqueueNotification(notification: ScheduledNotification): Promise<void> {
    try {
      const queueName = notification.priority === 'high' 
        ? this.QUEUE_NAMES.PRIORITY 
        : this.QUEUE_NAMES.MAIN;

      await this.redisClient.lPush(queueName, JSON.stringify(notification));
      
      logger.debug('Notification enqueued', {
        notificationId: notification.id,
        queue: queueName,
        priority: notification.priority,
      });
    } catch (error) {
      logger.error('Failed to enqueue notification', {
        notificationId: notification.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Process all queues
   */
  public async processQueues(): Promise<void> {
    try {
      // Process priority queue first
      await this.processQueue(this.QUEUE_NAMES.PRIORITY);
      
      // Process main queue
      await this.processQueue(this.QUEUE_NAMES.MAIN);
      
      // Process delayed notifications
      await this.processDueNotifications();
    } catch (error) {
      logger.error('Error during queue processing', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Process notifications from a specific queue
   */
  public async processQueue(queueName: string = this.QUEUE_NAMES.MAIN): Promise<ProcessResult> {
    const result: ProcessResult = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [],
    };

    try {
      while (true) {
        const notificationData = await this.redisClient.rPop(queueName);
        if (!notificationData) break;

        result.processed++;

        try {
          const notification: ScheduledNotification = JSON.parse(notificationData);
          const success = await this.sendNotification(notification);
          
          if (success) {
            result.successful++;
          } else {
            result.failed++;
            await this.handleFailedNotification(notification);
          }
        } catch (error) {
          result.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(errorMessage);
          logger.error('Failed to process queued notification', { error: errorMessage });
        }
      }

      if (result.processed > 0) {
        logger.info('Queue processing completed', {
          queueName,
          ...result,
        });
      }

      return result;
    } catch (error) {
      logger.error('Error processing queue', {
        queueName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Process due delayed notifications
   */
  public async processDueNotifications(): Promise<ProcessResult> {
    const result: ProcessResult = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [],
    };

    try {
      const now = Date.now();
      const dueNotifications = await this.redisClient.zRangeByScore(
        this.QUEUE_NAMES.DELAYED,
        '-inf',
        now
      );

      for (const notificationData of dueNotifications) {
        result.processed++;

        try {
          const notification: ScheduledNotification = JSON.parse(notificationData);
          const success = await this.sendNotification(notification);

          if (success) {
            result.successful++;
            // Remove from delayed queue
            await this.redisClient.zRem(this.QUEUE_NAMES.DELAYED, notificationData);
          } else {
            result.failed++;
            await this.handleFailedNotification(notification);
          }
        } catch (error) {
          result.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(errorMessage);
          logger.error('Failed to process delayed notification', { error: errorMessage });
        }
      }

      return result;
    } catch (error) {
      logger.error('Error processing delayed notifications', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Process a batch of notifications
   */
  public async processBatch(batchKey: string): Promise<BatchProcessResult> {
    try {
      const batchData = await this.redisClient.get(batchKey);
      if (!batchData) {
        return {
          success: false,
          notificationsSent: 0,
          originalCount: 0,
          error: 'Batch not found',
        };
      }

      const notifications: ScheduledNotification[] = JSON.parse(batchData);
      
      // Create batched notification
      const batchedNotification = await this.createBatchedNotification(notifications);
      const success = await this.sendNotification(batchedNotification);

      // Clean up batch
      await this.redisClient.del(batchKey);

      return {
        success,
        notificationsSent: success ? 1 : 0,
        originalCount: notifications.length,
      };
    } catch (error) {
      logger.error('Failed to process batch', {
        batchKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        success: false,
        notificationsSent: 0,
        originalCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get queue statistics
   */
  public async getQueueStats(): Promise<QueueStats> {
    try {
      const [mainQueue, priorityQueue, delayedQueue] = await Promise.all([
        this.redisClient.lLen(this.QUEUE_NAMES.MAIN),
        this.redisClient.lLen(this.QUEUE_NAMES.PRIORITY),
        this.redisClient.zCard(this.QUEUE_NAMES.DELAYED),
      ]);

      return {
        mainQueue,
        priorityQueue,
        delayedQueue,
        totalPending: mainQueue + priorityQueue + delayedQueue,
      };
    } catch (error) {
      logger.error('Failed to get queue stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        mainQueue: 0,
        priorityQueue: 0,
        delayedQueue: 0,
        totalPending: 0,
      };
    }
  }

  /**
   * Calculate next retry time using exponential backoff
   */
  public calculateNextRetryTime(notification: ScheduledNotification): Date {
    const retryCount = notification.retryCount || 0;
    const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff in milliseconds
    return new Date(Date.now() + delay);
  }

  /**
   * Configuration methods
   */
  
  public setBatchingOptions(options: Partial<BatchingOptions>): void {
    this.batchingOptions = { ...this.batchingOptions, ...options };
    logger.info('Batching options updated', this.batchingOptions);
  }

  public setRateLimits(limits: Partial<RateLimitOptions>): void {
    this.rateLimits = { ...this.rateLimits, ...limits };
    logger.info('Rate limits updated', this.rateLimits);
  }

  /**
   * Status methods
   */
  
  public isRunning(): boolean {
    return this.isRunning;
  }

  public getHealthStatus(): HealthStatus {
    const uptime = Date.now() - this.startTime.getTime();
    const averageProcessingTime = this.processedCount > 0 
      ? this.totalProcessingTime / this.processedCount 
      : 0;

    return {
      status: this.isRunning ? 'healthy' : 'unhealthy',
      uptime,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      queueSizes: { mainQueue: 0, priorityQueue: 0, delayedQueue: 0, totalPending: 0 }, // Will be updated by actual call
      lastProcessedAt: this.lastProcessedAt,
      averageProcessingTime,
    };
  }

  /**
   * Private helper methods
   */

  private async scheduleImmediateNotification(notification: ScheduledNotification): Promise<ScheduleResult> {
    // Check quiet hours (unless overridden)
    if (!notification.overrideQuietHours) {
      const inQuietHours = await this.preferencesService.isInQuietHours(notification.userId);
      
      if (inQuietHours && notification.priority !== 'high') {
        // Delay until end of quiet hours
        const delayedTime = this.calculateEndOfQuietHours(notification.userId);
        return await this.scheduleDelayedNotification({
          ...notification,
          scheduledFor: delayedTime,
        });
      }
    }

    // Check if should batch
    if (this.batchingOptions.enabled && this.shouldBatch(notification)) {
      return await this.addToBatch(notification);
    }

    // Send immediately
    const success = await this.sendNotification(notification);
    
    if (!success && this.shouldRetry(notification)) {
      return await this.scheduleRetry(notification);
    }

    return {
      success,
      notificationId: notification.id,
      scheduledFor: notification.scheduledFor,
      retryCount: notification.retryCount,
    };
  }

  private async scheduleDelayedNotification(notification: ScheduledNotification): Promise<ScheduleResult> {
    const timestamp = notification.scheduledFor.getTime();
    
    await this.redisClient.zAdd(
      this.QUEUE_NAMES.DELAYED,
      timestamp,
      JSON.stringify(notification)
    );

    return {
      success: true,
      notificationId: notification.id,
      scheduledFor: notification.scheduledFor,
      delayed: true,
      delayReason: 'future_scheduled',
    };
  }

  private async sendNotification(notification: ScheduledNotification): Promise<boolean> {
    try {
      this.processedCount++;

      // Get user device tokens
      const deviceTokens = await this.preferencesService.getUserDeviceTokens(notification.userId);
      if (deviceTokens.length === 0) {
        logger.warn('No device tokens found for user', { userId: notification.userId });
        return false;
      }

      // Render notification template
      const template = this.templateService.renderTemplate(
        notification.templateId,
        notification.variables
      );

      if (!template) {
        logger.error('Failed to render notification template', {
          templateId: notification.templateId,
          userId: notification.userId,
        });
        return false;
      }

      // Send to each device
      let sentCount = 0;
      for (const deviceToken of deviceTokens) {
        try {
          const result = await this.pushService.sendToDevice(
            deviceToken.device_token,
            {
              title: template.title,
              body: template.body,
              data: template.data,
            },
            deviceToken.platform as 'android' | 'ios' | 'web'
          );

          if (result.success) {
            sentCount++;
          }
        } catch (error) {
          logger.error('Failed to send to device', {
            deviceToken: deviceToken.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return sentCount > 0;
    } catch (error) {
      logger.error('Failed to send notification', {
        notificationId: notification.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  private async handleFailedNotification(notification: ScheduledNotification): Promise<void> {
    if (this.shouldRetry(notification)) {
      const retryNotification = {
        ...notification,
        retryCount: (notification.retryCount || 0) + 1,
        scheduledFor: this.calculateNextRetryTime(notification),
      };

      await this.scheduleDelayedNotification(retryNotification);
    } else {
      logger.error('Notification failed permanently', {
        notificationId: notification.id,
        retryCount: notification.retryCount,
        maxRetries: notification.maxRetries || this.DEFAULT_MAX_RETRIES,
      });
    }
  }

  private shouldRetry(notification: ScheduledNotification): boolean {
    const retryCount = notification.retryCount || 0;
    const maxRetries = notification.maxRetries || this.DEFAULT_MAX_RETRIES;
    return retryCount < maxRetries;
  }

  private async scheduleRetry(notification: ScheduledNotification): Promise<ScheduleResult> {
    const retryCount = (notification.retryCount || 0) + 1;
    const maxRetries = notification.maxRetries || this.DEFAULT_MAX_RETRIES;

    if (retryCount > maxRetries) {
      return {
        success: false,
        notificationId: notification.id,
        scheduledFor: notification.scheduledFor,
        error: 'Max retries exceeded',
        finalAttempt: true,
        retryCount,
      };
    }

    const retryNotification = {
      ...notification,
      retryCount,
      scheduledFor: this.calculateNextRetryTime(notification),
    };

    await this.scheduleDelayedNotification(retryNotification);

    return {
      success: true,
      notificationId: notification.id,
      scheduledFor: retryNotification.scheduledFor,
      delayed: true,
      delayReason: 'retry_backoff',
      retryCount,
    };
  }

  private shouldBatch(notification: ScheduledNotification): boolean {
    return (
      this.batchingOptions.enabled &&
      notification.priority !== 'high' &&
      notification.batchable !== false
    );
  }

  private async addToBatch(notification: ScheduledNotification): Promise<ScheduleResult> {
    const batchKey = `batch:${notification.userId}:${notification.templateId}`;
    const batchWindowEnd = new Date(Date.now() + this.batchingOptions.windowMs);

    // Add to batch
    await this.redisClient.setEx(
      batchKey,
      Math.ceil(this.batchingOptions.windowMs / 1000),
      JSON.stringify([notification])
    );

    return {
      success: true,
      notificationId: notification.id,
      scheduledFor: notification.scheduledFor,
      batched: true,
      batchWindowEnd,
    };
  }

  private groupNotificationsForBatching(
    notifications: ScheduledNotification[]
  ): BatchGroup[] {
    const groups = new Map<string, BatchGroup>();

    for (const notification of notifications) {
      const groupKey = `${notification.userId}:${notification.templateId}`;
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          userId: notification.userId,
          templateId: notification.templateId,
          notifications: [],
          batchKey: `batch:${groupKey}`,
        });
      }

      groups.get(groupKey)!.notifications.push(notification);
    }

    return Array.from(groups.values());
  }

  private canBatchGroup(group: BatchGroup): boolean {
    return (
      this.batchingOptions.enabled &&
      group.notifications.length > 1 &&
      group.notifications.length <= this.batchingOptions.maxBatchSize &&
      group.notifications.every(n => n.priority !== 'high')
    );
  }

  private async processBatchGroup(group: BatchGroup): Promise<{ results: ScheduleResult[] }> {
    const results: ScheduleResult[] = [];

    // Create batched notification
    const batchedNotification = await this.createBatchedNotification(group.notifications);
    const success = await this.sendNotification(batchedNotification);

    // Generate results for all notifications in the batch
    for (const notification of group.notifications) {
      results.push({
        success,
        notificationId: notification.id,
        scheduledFor: notification.scheduledFor,
        batched: true,
      });
    }

    return { results };
  }

  private async createBatchedNotification(
    notifications: ScheduledNotification[]
  ): Promise<ScheduledNotification> {
    const first = notifications[0];
    const count = notifications.length;

    return {
      id: `batch_${first.userId}_${Date.now()}`,
      userId: first.userId,
      templateId: 'batched_notification',
      variables: {
        count,
        notifications: notifications.map(n => n.variables),
      },
      priority: 'normal',
      scheduledFor: first.scheduledFor,
    };
  }

  private async isRateLimited(notification: ScheduledNotification): Promise<boolean> {
    if (notification.priority === 'high' && this.rateLimits.perUser.allowHighPriorityBypass) {
      return false;
    }

    // Check per-minute rate limit
    const minuteKey = `rate_limit:${notification.userId}:minute:${Math.floor(Date.now() / 60000)}`;
    const minuteCount = await this.redisClient.get(minuteKey);
    
    if (minuteCount && parseInt(minuteCount) >= this.rateLimits.perUser.perMinute) {
      return true;
    }

    // Increment counter
    await this.redisClient.setEx(minuteKey, 60, String(parseInt(minuteCount || '0') + 1));

    return false;
  }

  private getNotificationTypeFromTemplate(templateId: string): string {
    // Map template IDs to notification types
    const typeMap: Record<string, string> = {
      'like_notification': 'likes',
      'comment_notification': 'comments',
      'follow_notification': 'follows',
      'milestone_reminder': 'milestone_reminders',
    };

    return typeMap[templateId] || templateId;
  }

  private calculateEndOfQuietHours(userId: string): Date {
    // This would need to integrate with user preferences
    // For now, assume quiet hours end at 8 AM next day
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    return tomorrow;
  }
}