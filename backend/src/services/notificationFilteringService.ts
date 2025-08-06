/**
 * Notification Filtering Service
 * Intelligent filtering system with importance scoring, frequency limiting, and spam detection
 */

import { getRedisCacheService } from './redisCacheService';
import { getSupabaseClient } from './supabase';
import { logger } from '../utils/logger';

export interface NotificationToFilter {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'trending' | 'system' | 'presence';
  userId: string;
  senderId?: string;
  data?: Record<string, any>;
  timestamp: Date;
}

export interface FilteringDecision {
  allowed: boolean;
  reason?: string;
  importanceScore?: number;
  suggestedDelay?: number;
  batchWithOthers?: boolean;
}

export interface FilteringMetrics {
  totalProcessed: number;
  spamBlocked: number;
  lowImportanceBlocked: number;
  frequencyLimited: number;
  userPreferenceBlocked: number;
  filteringRate: number;
}

export interface UserFilteringInsights {
  userId: string;
  totalProcessed: number;
  spamBlocked: number;
  lowImportanceBlocked: number;
  averageImportanceScore: number;
  preferredTypes: string[];
}

export interface DailyFilteringReport {
  date: Date;
  totalNotifications: number;
  spamBlocked: number;
  lowImportanceBlocked: number;
  frequencyLimited: number;
  deliveryRate: number;
  topSpamSenders: Array<{ senderId: string; count: number }>;
}

export interface BatchedNotification {
  id: string;
  type: 'batch';
  userId: string;
  data: {
    notifications: NotificationToFilter[];
    summary: string;
    totalCount: number;
  };
  timestamp: Date;
  importanceScore: number;
}

export class NotificationFilteringService {
  private cacheService: any;

  // Configuration constants
  private readonly FREQUENCY_LIMITS = {
    like: { hourly: 20, daily: 100 },
    comment: { hourly: 15, daily: 80 },
    follow: { hourly: 10, daily: 50 },
    mention: { hourly: 8, daily: 40 },
    trending: { hourly: 5, daily: 20 },
    system: { hourly: 3, daily: 15 },
    presence: { hourly: 50, daily: 200 } // Higher limits for presence updates
  };

  private readonly SPAM_THRESHOLDS = {
    rapidFire: 5, // notifications within 30 seconds
    senderHourlyLimit: 10, // max notifications from same sender per hour
    suspiciousBurstWindow: 300000 // 5 minutes
  };

  private readonly IMPORTANCE_WEIGHTS = {
    mention: 0.9,
    comment: 0.7,
    follow: 0.6,
    like: 0.4,
    trending: 0.8,
    system: 0.5,
    presence: 0.3
  };

  private readonly QUIET_HOURS = {
    start: 22, // 10 PM
    end: 8,    // 8 AM
    minImportanceScore: 0.7 // Only high importance notifications during quiet hours
  };

  constructor() {
    this.cacheService = getRedisCacheService();
  }

  /**
   * Main filtering decision function
   */
  public async shouldSendNotification(notification: NotificationToFilter): Promise<FilteringDecision> {
    try {
      // 1. Calculate importance score
      const importanceScore = await this.calculateImportanceScore(notification);

      // 2. Check user preferences
      const userPreferencesCheck = await this.checkUserPreferences(notification);
      if (!userPreferencesCheck.allowed) {
        await this.trackFilteringMetric(notification.userId, 'blocked', 'user_preferences');
        return userPreferencesCheck;
      }

      // 3. Check for spam/abuse
      const isSpam = await this.detectSpam([notification]);
      if (isSpam) {
        await this.trackFilteringMetric(notification.userId, 'blocked', 'spam_detected');
        return {
          allowed: false,
          reason: 'Detected as spam or abuse',
          importanceScore
        };
      }

      // 4. Check frequency limits
      const withinFrequencyLimit = await this.checkFrequencyLimit(notification.userId, notification.type);
      if (!withinFrequencyLimit) {
        await this.trackFilteringMetric(notification.userId, 'blocked', 'frequency_limit');
        return {
          allowed: false,
          reason: 'Frequency limit exceeded',
          importanceScore,
          suggestedDelay: 3600000 // Suggest 1 hour delay
        };
      }

      // 5. Check quiet hours
      const quietHoursCheck = await this.checkQuietHours(notification, importanceScore);
      if (!quietHoursCheck.allowed) {
        await this.trackFilteringMetric(notification.userId, 'delayed', 'quiet_hours');
        return quietHoursCheck;
      }

      // 6. Check if should batch with similar notifications
      const shouldBatch = await this.shouldBatchNotification(notification, importanceScore);
      if (shouldBatch) {
        await this.trackFilteringMetric(notification.userId, 'batched', 'low_importance');
        return {
          allowed: true,
          reason: 'Batched with similar notifications',
          importanceScore,
          batchWithOthers: true,
          suggestedDelay: 900000 // 15 minutes batching window
        };
      }

      // 7. Allow notification
      await this.trackFilteringMetric(notification.userId, 'allowed', 'passed_all_checks');
      return {
        allowed: true,
        importanceScore
      };

    } catch (error) {
      logger.error('Error in notification filtering', {
        component: 'NotificationFilteringService',
        notificationId: notification.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Default to allowing notification if filtering fails
      return {
        allowed: true,
        reason: 'Filtering service error - defaulting to allow'
      };
    }
  }

  /**
   * Calculate importance score based on multiple factors
   */
  public async calculateImportanceScore(notification: NotificationToFilter): Promise<number> {
    try {
      // Base score from notification type
      let score = this.IMPORTANCE_WEIGHTS[notification.type] || 0.5;

      // Factor in user engagement history
      const userEngagement = await this.getUserEngagementHistory(notification.userId);
      if (userEngagement) {
        // Higher engagement users get higher scores for their preferred types
        if (userEngagement.preferred_types?.includes(notification.type)) {
          score *= 1.2;
        }
        
        // Adjust based on open rate
        const openRateBonus = (userEngagement.avg_open_rate - 0.5) * 0.2;
        score += openRateBonus;
      }

      // Factor in notification-specific data
      if (notification.data) {
        score = await this.adjustScoreForNotificationData(score, notification);
      }

      // Factor in sender reputation (if applicable)
      if (notification.senderId) {
        const senderReputation = await this.getSenderReputation(notification.senderId);
        score *= senderReputation;
      }

      // Factor in recency and relevance
      score = this.adjustScoreForRecency(score, notification.timestamp);

      // Ensure score is within bounds
      return Math.max(0, Math.min(1, score));

    } catch (error) {
      logger.error('Error calculating importance score', {
        component: 'NotificationFilteringService',
        notificationId: notification.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return default medium importance if calculation fails
      return 0.5;
    }
  }

  /**
   * Check if notification frequency is within limits
   */
  public async checkFrequencyLimit(userId: string, notificationType: string): Promise<boolean> {
    try {
      if (!this.cacheService || !this.cacheService.isReady()) {
        return true; // Allow if cache is not available
      }

      const limits = this.FREQUENCY_LIMITS[notificationType as keyof typeof this.FREQUENCY_LIMITS] || 
                    this.FREQUENCY_LIMITS.system;

      // Check hourly limit
      const hourlyKey = `freq_limit:${userId}:${notificationType}:${this.getCurrentHour()}`;
      const hourlyCount = parseInt(await this.cacheService.get(hourlyKey) || '0');

      if (hourlyCount >= limits.hourly) {
        return false;
      }

      // Check daily limit
      const dailyKey = `freq_limit:${userId}:${notificationType}:${this.getCurrentDay()}`;
      const dailyCount = parseInt(await this.cacheService.get(dailyKey) || '0');

      if (dailyCount >= limits.daily) {
        return false;
      }

      // Increment counters
      await this.cacheService.increment(hourlyKey);
      await this.cacheService.set(hourlyKey, hourlyCount + 1, 3600); // 1 hour TTL
      
      await this.cacheService.increment(dailyKey);
      await this.cacheService.set(dailyKey, dailyCount + 1, 86400); // 24 hour TTL

      return true;

    } catch (error) {
      logger.error('Error checking frequency limit', {
        component: 'NotificationFilteringService',
        userId,
        notificationType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Default to allowing if check fails
      return true;
    }
  }

  /**
   * Detect spam and abuse patterns
   */
  public async detectSpam(notifications: NotificationToFilter[]): Promise<boolean> {
    try {
      if (!this.cacheService || !this.cacheService.isReady()) {
        return false; // Can't detect spam without cache
      }

      const notification = notifications[0]; // Primary notification to check
      
      // Check if sender is blacklisted
      if (notification.senderId) {
        const isBlacklisted = await this.cacheService.exists(`blacklist:${notification.senderId}`);
        if (isBlacklisted) {
          return true;
        }
      }

      // Check for rapid-fire notifications (same type, same recipient, short time window)
      if (notifications.length >= this.SPAM_THRESHOLDS.rapidFire) {
        const timestamps = notifications.map(n => n.timestamp.getTime());
        const timeSpan = Math.max(...timestamps) - Math.min(...timestamps);
        
        if (timeSpan < 30000) { // Less than 30 seconds
          return true;
        }
      }

      // Check sender frequency (if we have a sender)
      if (notification.senderId) {
        const now = Date.now();
        const hourAgo = now - 3600000;
        
        const recentCount = await this.cacheService.zCount(
          `sender_activity:${notification.senderId}`,
          hourAgo,
          now
        );

        if (recentCount > this.SPAM_THRESHOLDS.senderHourlyLimit) {
          return true;
        }

        // Track this activity
        await this.cacheService.zAdd(
          `sender_activity:${notification.senderId}`,
          now,
          `${notification.id}:${notification.userId}`
        );
      }

      return false;

    } catch (error) {
      logger.error('Error in spam detection', {
        component: 'NotificationFilteringService',
        notificationId: notifications[0]?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Default to not spam if detection fails
      return false;
    }
  }

  /**
   * Get sender reputation score
   */
  public async getSenderReputation(senderId: string): Promise<number> {
    try {
      if (!this.cacheService || !this.cacheService.isReady()) {
        return 0.8; // Default good reputation
      }

      const cachedReputation = await this.cacheService.get(`reputation:${senderId}`);
      if (cachedReputation) {
        return parseFloat(cachedReputation);
      }

      // Calculate reputation based on historical data
      // This is a simplified version - in production, this would be more sophisticated
      const reputation = 0.8; // Default reputation for new users

      // Cache for future lookups
      await this.cacheService.set(`reputation:${senderId}`, reputation.toString(), 86400);

      return reputation;

    } catch (error) {
      logger.error('Error getting sender reputation', {
        component: 'NotificationFilteringService',
        senderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return 0.8; // Default to good reputation
    }
  }

  /**
   * Batch similar notifications together
   */
  public async batchNotifications(notifications: NotificationToFilter[]): Promise<BatchedNotification> {
    const firstNotification = notifications[0];
    
    // Create a summary of the batched notifications
    const typeCounts = notifications.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const summary = Object.entries(typeCounts)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');

    // Calculate combined importance score (average of individual scores)
    let combinedScore = 0;
    for (const notification of notifications) {
      const score = await this.calculateImportanceScore(notification);
      combinedScore += score;
    }
    combinedScore = combinedScore / notifications.length;

    return {
      id: `batch_${Date.now()}_${firstNotification.userId}`,
      type: 'batch',
      userId: firstNotification.userId,
      data: {
        notifications,
        summary: `You have ${notifications.length} new notifications: ${summary}`,
        totalCount: notifications.length
      },
      timestamp: new Date(),
      importanceScore: combinedScore
    };
  }

  /**
   * Track filtering metrics for analytics
   */
  public async trackFilteringMetric(
    userId: string, 
    action: 'allowed' | 'blocked' | 'delayed' | 'batched',
    reason: string
  ): Promise<void> {
    try {
      if (!this.cacheService || !this.cacheService.isReady()) {
        return;
      }

      const today = this.getCurrentDay();
      const hour = this.getCurrentHour();

      // Track global metrics
      await this.cacheService.increment(`filtering_metrics:${action}:${reason}:${today}`);
      await this.cacheService.increment(`filtering_metrics:${action}:${reason}:${hour}`);

      // Track user-specific metrics
      await this.cacheService.increment(`user_filtering_metrics:${userId}:${action}:${today}`);

    } catch (error) {
      logger.error('Error tracking filtering metric', {
        component: 'NotificationFilteringService',
        userId,
        action,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get filtering effectiveness metrics
   */
  public async getFilteringEffectiveness(): Promise<FilteringMetrics> {
    try {
      if (!this.cacheService || !this.cacheService.isReady()) {
        throw new Error('Cache service not available');
      }

      const today = this.getCurrentDay();

      const totalProcessed = parseInt(await this.cacheService.get(`filtering_metrics:total:${today}`) || '0');
      const spamBlocked = parseInt(await this.cacheService.get(`filtering_metrics:blocked:spam_detected:${today}`) || '0');
      const lowImportanceBlocked = parseInt(await this.cacheService.get(`filtering_metrics:blocked:low_importance:${today}`) || '0');
      const frequencyLimited = parseInt(await this.cacheService.get(`filtering_metrics:blocked:frequency_limit:${today}`) || '0');
      const userPreferenceBlocked = parseInt(await this.cacheService.get(`filtering_metrics:blocked:user_preferences:${today}`) || '0');

      const totalBlocked = spamBlocked + lowImportanceBlocked + frequencyLimited + userPreferenceBlocked;
      const filteringRate = totalProcessed > 0 ? totalBlocked / totalProcessed : 0;

      return {
        totalProcessed,
        spamBlocked,
        lowImportanceBlocked,
        frequencyLimited,
        userPreferenceBlocked,
        filteringRate
      };

    } catch (error) {
      logger.error('Error getting filtering effectiveness', {
        component: 'NotificationFilteringService',
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        totalProcessed: 0,
        spamBlocked: 0,
        lowImportanceBlocked: 0,
        frequencyLimited: 0,
        userPreferenceBlocked: 0,
        filteringRate: 0
      };
    }
  }

  /**
   * Get user-specific filtering insights
   */
  public async getUserFilteringInsights(userId: string): Promise<UserFilteringInsights> {
    try {
      if (!this.cacheService || !this.cacheService.isReady()) {
        throw new Error('Cache service not available');
      }

      const today = this.getCurrentDay();

      const totalProcessed = parseInt(await this.cacheService.get(`user_filtering_metrics:${userId}:total:${today}`) || '0');
      const spamBlocked = parseInt(await this.cacheService.get(`user_filtering_metrics:${userId}:blocked:${today}`) || '0');
      const lowImportanceBlocked = parseInt(await this.cacheService.get(`user_filtering_metrics:${userId}:low_importance:${today}`) || '0');

      // Get user engagement data for preferred types
      const userEngagement = await this.getUserEngagementHistory(userId);
      const preferredTypes = userEngagement?.preferred_types || [];

      return {
        userId,
        totalProcessed,
        spamBlocked,
        lowImportanceBlocked,
        averageImportanceScore: 0.5, // Simplified - would calculate from actual data
        preferredTypes
      };

    } catch (error) {
      logger.error('Error getting user filtering insights', {
        component: 'NotificationFilteringService',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        userId,
        totalProcessed: 0,
        spamBlocked: 0,
        lowImportanceBlocked: 0,
        averageImportanceScore: 0.5,
        preferredTypes: []
      };
    }
  }

  /**
   * Generate daily filtering report
   */
  public async generateDailyReport(date: Date): Promise<DailyFilteringReport> {
    try {
      const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');

      if (!this.cacheService || !this.cacheService.isReady()) {
        throw new Error('Cache service not available');
      }

      const totalNotifications = parseInt(await this.cacheService.get(`filtering_metrics:total:${dateStr}`) || '0');
      const spamBlocked = parseInt(await this.cacheService.get(`filtering_metrics:blocked:spam_detected:${dateStr}`) || '0');
      const lowImportanceBlocked = parseInt(await this.cacheService.get(`filtering_metrics:blocked:low_importance:${dateStr}`) || '0');
      const frequencyLimited = parseInt(await this.cacheService.get(`filtering_metrics:blocked:frequency_limit:${dateStr}`) || '0');

      const totalBlocked = spamBlocked + lowImportanceBlocked + frequencyLimited;
      const deliveryRate = totalNotifications > 0 ? (totalNotifications - totalBlocked) / totalNotifications : 0;

      return {
        date,
        totalNotifications,
        spamBlocked,
        lowImportanceBlocked,
        frequencyLimited,
        deliveryRate,
        topSpamSenders: [] // Simplified - would get actual data
      };

    } catch (error) {
      logger.error('Error generating daily report', {
        component: 'NotificationFilteringService',
        date,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        date,
        totalNotifications: 0,
        spamBlocked: 0,
        lowImportanceBlocked: 0,
        frequencyLimited: 0,
        deliveryRate: 0,
        topSpamSenders: []
      };
    }
  }

  // Private helper methods

  private async checkUserPreferences(notification: NotificationToFilter): Promise<FilteringDecision> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('push_notifications, notification_types')
        .eq('user_id', notification.userId)
        .single();

      if (error || !data) {
        return { allowed: true }; // Default to allowing if no preferences found
      }

      // Check if push notifications are globally disabled
      if (!data.push_notifications) {
        return {
          allowed: false,
          reason: 'User has disabled push notifications'
        };
      }

      // Check if specific notification type is disabled
      const notificationTypes = data.notification_types || {};
      if (notificationTypes[notification.type] === false) {
        return {
          allowed: false,
          reason: `User has disabled ${notification.type} notifications`
        };
      }

      return { allowed: true };

    } catch (error) {
      logger.error('Error checking user preferences', {
        component: 'NotificationFilteringService',
        userId: notification.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return { allowed: true }; // Default to allowing if check fails
    }
  }

  private async checkQuietHours(_notification: NotificationToFilter, importanceScore: number): Promise<FilteringDecision> {
    const now = new Date();
    const hour = now.getHours();

    // Check if current time is within quiet hours
    const isQuietTime = (this.QUIET_HOURS.start < this.QUIET_HOURS.end) 
      ? (hour >= this.QUIET_HOURS.start || hour < this.QUIET_HOURS.end)
      : (hour >= this.QUIET_HOURS.start && hour < this.QUIET_HOURS.end);

    if (isQuietTime && importanceScore < this.QUIET_HOURS.minImportanceScore) {
      return {
        allowed: false,
        reason: 'Low importance notification during quiet hours',
        importanceScore,
        suggestedDelay: this.getMillisecondsUntilEndOfQuietHours()
      };
    }

    return { allowed: true, importanceScore };
  }

  private async shouldBatchNotification(notification: NotificationToFilter, importanceScore: number): Promise<boolean> {
    // Only batch low-importance notifications
    if (importanceScore > 0.5) {
      return false;
    }

    // Only batch certain types of notifications
    const batchableTypes = ['like', 'follow'];
    return batchableTypes.includes(notification.type);
  }

  private async getUserEngagementHistory(userId: string): Promise<any> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('user_notification_stats')
        .select('avg_open_rate, avg_click_rate, total_notifications, preferred_types')
        .eq('user_id', userId)
        .single();

      if (error) {
        return null;
      }

      return data;

    } catch (error) {
      return null;
    }
  }

  private async adjustScoreForNotificationData(baseScore: number, notification: NotificationToFilter): Promise<number> {
    let score = baseScore;

    if (notification.data) {
      // Adjust based on notification-specific factors
      switch (notification.type) {
        case 'like':
          if (notification.data['likerIsFollower']) score *= 1.3;
          if (notification.data['totalLikes'] && notification.data['totalLikes'] > 10) score *= 1.1;
          break;

        case 'comment':
          if (notification.data['isReply']) score *= 1.2;
          if (notification.data['commenterIsFollower']) score *= 1.4;
          break;

        case 'mention':
          score *= 1.5; // Mentions are always important
          break;

        case 'trending':
          if (notification.data['trendingRank'] && notification.data['trendingRank'] <= 5) score *= 1.3;
          if (notification.data['isUserContent']) score *= 1.4;
          break;
      }
    }

    return score;
  }

  private adjustScoreForRecency(score: number, timestamp: Date): number {
    const ageMs = Date.now() - timestamp.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    // Reduce score for older notifications
    if (ageHours > 24) {
      return score * 0.5;
    } else if (ageHours > 6) {
      return score * 0.8;
    } else if (ageHours > 1) {
      return score * 0.9;
    }

    return score;
  }

  private getCurrentHour(): string {
    const now = new Date();
    return `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}`;
  }

  private getCurrentDay(): string {
    const now = new Date();
    return `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
  }

  private getMillisecondsUntilEndOfQuietHours(): number {
    const now = new Date();
    const endOfQuietHours = new Date();
    endOfQuietHours.setHours(this.QUIET_HOURS.end, 0, 0, 0);

    if (endOfQuietHours < now) {
      endOfQuietHours.setDate(endOfQuietHours.getDate() + 1);
    }

    return endOfQuietHours.getTime() - now.getTime();
  }
}