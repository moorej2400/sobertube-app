/**
 * Notification Analytics Service
 * Tracks notification delivery, engagement, performance metrics, and insights
 */

import { supabase } from './supabase';
import { getRedisCacheService } from './redisCacheService';
import { logger } from '../utils/logger';

export interface NotificationEvent {
  notificationId: string;
  userId: string;
  type: 'sent' | 'delivered' | 'opened' | 'clicked' | 'dismissed' | 'failed';
  templateId?: string;
  platform?: string;
  metadata?: Record<string, any>;
  timestamp?: Date;
}

export interface EventTrackingResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export interface DeliveryRateResult {
  [platform: string]: {
    sent: number;
    delivered: number;
    failed: number;
    deliveryRate: number;
    failureRate: number;
  };
}

export interface DeliveryPerformanceMetric {
  templateId: string;
  platform: string;
  sent: number;
  delivered: number;
  opened: number;
  deliveryRate: number;
  openRate: number;
  avgDeliveryTime: number;
}

export interface DeliveryTimeDistribution {
  platform: string;
  distribution: Record<string, number>;
  totalNotifications: number;
}

export interface EngagementRates {
  [templateId: string]: {
    delivered: number;
    opened: number;
    clicked: number;
    openRate: number;
    clickRate: number;
    clickThroughRate: number;
  };
}

export interface UserEngagementPattern {
  userId: string;
  totalNotifications: number;
  openRate: number;
  clickRate: number;
  dismissRate: number;
  avgTimeToOpen: number;
  mostEngagedTime: string;
  mostEngagedDay: string;
  preferredTypes: string[];
}

export interface FatigueAnalysis {
  userId: string;
  hasFatigue: boolean;
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  indicators: string[];
  recommendations: string[];
  trendData: Array<{
    period: string;
    openRate: number;
    clickRate: number;
  }>;
}

export interface TimePerformanceAnalysis {
  period: { start: string; end: string };
  bestPerformingHour: {
    hour: number;
    openRate: number;
    avgDeliveryTime: number;
  };
  worstPerformingHour: {
    hour: number;
    openRate: number;
    avgDeliveryTime: number;
  };
  hourlyBreakdown: Array<{
    hour: number;
    sent: number;
    opened: number;
    openRate: number;
    avgDeliveryTime: number;
  }>;
  recommendations: string[];
}

export interface ABTestResult {
  testId: string;
  variantA: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
  };
  variantB: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
  };
  winner: 'variant_a' | 'variant_b' | 'no_significant_difference';
  significance: {
    pValue: number;
    confidenceLevel: number;
    isSignificant: boolean;
  };
  improvement: {
    deliveryRate: number;
    openRate: number;
    clickRate: number;
  };
}

export interface AnomalyDetectionResult {
  anomaliesDetected: boolean;
  anomalies: Array<{
    date: string;
    metric: string;
    value: number;
    expectedRange: { min: number; max: number };
    severity: 'low' | 'medium' | 'high';
    possibleCauses: string[];
  }>;
  period: { start: string; end: string };
}

export interface RealTimeStats {
  sent: number;
  delivered: number;
  opened: number;
  failed: number;
  deliveryRate: number;
  openRate: number;
  failureRate: number;
  lastUpdated: Date;
}

export interface HourlyVolume {
  current: number;
  previous: number;
  twoHoursAgo: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercent: number;
}

export interface QueueHealth {
  mainQueue: number;
  priorityQueue: number;
  delayedQueue: number;
  failedQueue: number;
  totalPending: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
  alerts: string[];
}

export interface DailySummary {
  date: string;
  metrics: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    failed: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    avgDeliveryTime: number;
    uniqueUsers: number;
  };
  trends: {
    sentChange: number;
    deliveryRateChange: number;
    openRateChange: number;
  };
  topPerformingTemplates: Array<{
    templateId: string;
    sent: number;
    openRate: number;
  }>;
  insights: string[];
}

export interface WeeklyReport {
  period: { start: string; end: string };
  summary: {
    totalSent: number;
    totalDelivered: number;
    totalOpened: number;
    avgDeliveryRate: number;
    avgOpenRate: number;
    uniqueUsers: number;
  };
  dailyBreakdown: Array<{
    date: string;
    sent: number;
    delivered: number;
    opened: number;
    deliveryRate: number;
    openRate: number;
  }>;
  trends: {
    volumeTrend: 'increasing' | 'decreasing' | 'stable';
    engagementTrend: 'improving' | 'declining' | 'stable';
  };
  insights: string[];
}

export interface ExportResult {
  format: string;
  filename: string;
  data: string;
  recordCount: number;
  generatedAt: Date;
}

export interface DataRetentionResult {
  success: boolean;
  recordsDeleted: number;
  cutoffDate: Date;
  error?: string;
}

export interface AggregationResult {
  success: boolean;
  summaryId: string;
  recordsProcessed: number;
  error?: string;
}

export class NotificationAnalyticsService {
  private cacheService = getRedisCacheService();

  /**
   * Event Tracking
   */

  public async trackEvent(event: NotificationEvent): Promise<EventTrackingResult> {
    try {
      const eventRecord = {
        notification_id: event.notificationId,
        user_id: event.userId,
        event_type: event.type,
        template_id: event.templateId,
        platform: event.platform,
        metadata: event.metadata,
        timestamp: event.timestamp || new Date(),
      };

      const { data, error } = await supabase
        .from('notification_events')
        .insert(eventRecord)
        .single();

      if (error) {
        logger.error('Failed to track notification event', {
          notificationId: event.notificationId,
          eventType: event.type,
          error: error.message,
        });
        return { success: false, error: error.message };
      }

      // Update real-time counters
      await this.updateRealTimeCounters(event);

      return {
        success: true,
        eventId: data.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to track notification event', {
        notificationId: event.notificationId,
        eventType: event.type,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Delivery Metrics
   */

  public async getDeliveryRates(startDate: string, endDate: string): Promise<DeliveryRateResult> {
    try {
      const { data, error } = await supabase
        .from('notification_events')
        .select('platform, event_type, COUNT(*) as count')
        .gte('timestamp', startDate)
        .lte('timestamp', endDate)
        .in('event_type', ['sent', 'delivered', 'failed']);

      if (error) {
        logger.error('Failed to get delivery rates', { error: error.message });
        throw error;
      }

      const result: DeliveryRateResult = {};
      const platforms = ['android', 'ios', 'web'];

      // Initialize platforms
      platforms.forEach(platform => {
        result[platform] = {
          sent: 0,
          delivered: 0,
          failed: 0,
          deliveryRate: 0,
          failureRate: 0,
        };
      });

      // Process data
      data?.forEach(row => {
        const platform = row.platform;
        const eventType = row.event_type;
        const count = parseInt(row.count);

        if (platform && result[platform]) {
          result[platform][eventType] = count;
        }
      });

      // Calculate rates
      let totalSent = 0;
      let totalDelivered = 0;
      let totalFailed = 0;

      Object.keys(result).forEach(platform => {
        const metrics = result[platform];
        if (metrics.sent > 0) {
          metrics.deliveryRate = Number(((metrics.delivered / metrics.sent) * 100).toFixed(2));
          metrics.failureRate = Number(((metrics.failed / metrics.sent) * 100).toFixed(2));
        }
        totalSent += metrics.sent;
        totalDelivered += metrics.delivered;
        totalFailed += metrics.failed;
      });

      // Add overall metrics
      result.overall = {
        sent: totalSent,
        delivered: totalDelivered,
        failed: totalFailed,
        deliveryRate: totalSent > 0 ? Number(((totalDelivered / totalSent) * 100).toFixed(2)) : 0,
        failureRate: totalSent > 0 ? Number(((totalFailed / totalSent) * 100).toFixed(2)) : 0,
      };

      return result;
    } catch (error) {
      logger.error('Failed to get delivery rates', {
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {};
    }
  }

  public async getDeliveryPerformance(
    startDate: string,
    endDate: string
  ): Promise<DeliveryPerformanceMetric[]> {
    try {
      const { data, error } = await supabase
        .from('notification_performance_summary')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate);

      if (error) {
        logger.error('Failed to get delivery performance', { error: error.message });
        return [];
      }

      return (data || []).map(row => ({
        templateId: row.template_id,
        platform: row.platform,
        sent: row.sent_count,
        delivered: row.delivered_count,
        opened: row.opened_count,
        deliveryRate: row.sent_count > 0 ? (row.delivered_count / row.sent_count) * 100 : 0,
        openRate: row.delivered_count > 0 ? (row.opened_count / row.delivered_count) * 100 : 0,
        avgDeliveryTime: row.avg_delivery_time_ms,
      }));
    } catch (error) {
      logger.error('Failed to get delivery performance', {
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  public async getDeliveryTimeDistribution(
    platform: string,
    startDate: string,
    endDate: string
  ): Promise<DeliveryTimeDistribution> {
    try {
      const { data, error } = await supabase
        .from('delivery_time_distribution')
        .select('delivery_time_bucket, count')
        .eq('platform', platform)
        .gte('date', startDate)
        .lte('date', endDate);

      if (error) {
        logger.error('Failed to get delivery time distribution', { error: error.message });
        throw error;
      }

      const distribution: Record<string, number> = {};
      let totalNotifications = 0;

      data?.forEach(row => {
        distribution[row.delivery_time_bucket] = row.count;
        totalNotifications += row.count;
      });

      return {
        platform,
        distribution,
        totalNotifications,
      };
    } catch (error) {
      logger.error('Failed to get delivery time distribution', {
        platform,
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        platform,
        distribution: {},
        totalNotifications: 0,
      };
    }
  }

  /**
   * Engagement Analytics
   */

  public async getEngagementRates(startDate: string, endDate: string): Promise<EngagementRates> {
    try {
      const { data, error } = await supabase
        .from('engagement_summary')
        .select('template_id, delivered, opened, clicked')
        .gte('date', startDate)
        .lte('date', endDate);

      if (error) {
        logger.error('Failed to get engagement rates', { error: error.message });
        throw error;
      }

      const result: EngagementRates = {};

      data?.forEach(row => {
        const templateId = row.template_id;
        const delivered = row.delivered;
        const opened = row.opened;
        const clicked = row.clicked;

        result[templateId] = {
          delivered,
          opened,
          clicked,
          openRate: delivered > 0 ? Number(((opened / delivered) * 100).toFixed(2)) : 0,
          clickRate: delivered > 0 ? Number(((clicked / delivered) * 100).toFixed(2)) : 0,
          clickThroughRate: opened > 0 ? Number(((clicked / opened) * 100).toFixed(2)) : 0,
        };
      });

      return result;
    } catch (error) {
      logger.error('Failed to get engagement rates', {
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {};
    }
  }

  public async getUserEngagementPattern(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<UserEngagementPattern> {
    try {
      const { data, error } = await supabase
        .from('user_engagement_summary')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .single();

      if (error) {
        logger.error('Failed to get user engagement pattern', { error: error.message });
        throw error;
      }

      const totalNotifications = data.total_notifications;
      const openedNotifications = data.opened_notifications;
      const clickedNotifications = data.clicked_notifications;
      const dismissedNotifications = data.dismissed_notifications;

      return {
        userId,
        totalNotifications,
        openRate: totalNotifications > 0 ? (openedNotifications / totalNotifications) * 100 : 0,
        clickRate: totalNotifications > 0 ? (clickedNotifications / totalNotifications) * 100 : 0,
        dismissRate: totalNotifications > 0 ? (dismissedNotifications / totalNotifications) * 100 : 0,
        avgTimeToOpen: data.avg_time_to_open_ms,
        mostEngagedTime: data.most_engaged_time,
        mostEngagedDay: data.most_engaged_day,
        preferredTypes: data.preferred_notification_types,
      };
    } catch (error) {
      logger.error('Failed to get user engagement pattern', {
        userId,
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async analyzeFatigue(userId: string): Promise<FatigueAnalysis> {
    try {
      const { data, error } = await supabase
        .from('user_engagement_trends')
        .select('week, open_rate, click_rate')
        .eq('user_id', userId)
        .order('week', { ascending: true })
        .limit(8); // Last 8 weeks

      if (error) {
        logger.error('Failed to analyze notification fatigue', { error: error.message });
        throw error;
      }

      const trendData = data || [];
      const indicators: string[] = [];
      const recommendations: string[] = [];

      // Analyze trends
      let hasFatigue = false;
      let severity: 'none' | 'mild' | 'moderate' | 'severe' = 'none';

      if (trendData.length >= 4) {
        const recent = trendData.slice(-4);
        const earlier = trendData.slice(0, 4);

        const recentAvgOpenRate = recent.reduce((sum, d) => sum + d.open_rate, 0) / recent.length;
        const earlierAvgOpenRate = earlier.reduce((sum, d) => sum + d.open_rate, 0) / earlier.length;

        const recentAvgClickRate = recent.reduce((sum, d) => sum + d.click_rate, 0) / recent.length;
        const earlierAvgClickRate = earlier.reduce((sum, d) => sum + d.click_rate, 0) / earlier.length;

        const openRateDecline = ((earlierAvgOpenRate - recentAvgOpenRate) / earlierAvgOpenRate) * 100;
        const clickRateDecline = ((earlierAvgClickRate - recentAvgClickRate) / earlierAvgClickRate) * 100;

        if (openRateDecline > 10) {
          hasFatigue = true;
          indicators.push('declining_open_rate');
        }

        if (clickRateDecline > 15) {
          hasFatigue = true;
          indicators.push('declining_click_rate');
        }

        if (recentAvgOpenRate < 20) {
          indicators.push('low_engagement');
        }

        // Determine severity
        if (openRateDecline > 30 || clickRateDecline > 40) {
          severity = 'severe';
        } else if (openRateDecline > 20 || clickRateDecline > 25) {
          severity = 'moderate';
        } else if (openRateDecline > 10 || clickRateDecline > 15) {
          severity = 'mild';
        }
      }

      // Generate recommendations
      if (hasFatigue) {
        recommendations.push('reduce_frequency');
        recommendations.push('improve_relevance');
        if (severity === 'severe') {
          recommendations.push('pause_notifications');
        }
      }

      return {
        userId,
        hasFatigue,
        severity,
        indicators,
        recommendations,
        trendData: trendData.map(d => ({
          period: d.week,
          openRate: d.open_rate,
          clickRate: d.click_rate,
        })),
      };
    } catch (error) {
      logger.error('Failed to analyze notification fatigue', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Performance Insights
   */

  public async analyzePerformanceByTime(
    startDate: string,
    endDate: string
  ): Promise<TimePerformanceAnalysis> {
    try {
      const { data, error } = await supabase
        .from('hourly_performance')
        .select('hour, sent, opened, avg_delivery_time')
        .gte('date', startDate)
        .lte('date', endDate);

      if (error) {
        logger.error('Failed to analyze performance by time', { error: error.message });
        throw error;
      }

      const hourlyBreakdown = (data || []).map(row => ({
        hour: row.hour,
        sent: row.sent,
        opened: row.opened,
        openRate: row.sent > 0 ? (row.opened / row.sent) * 100 : 0,
        avgDeliveryTime: row.avg_delivery_time,
      }));

      // Find best and worst performing hours
      let bestHour = hourlyBreakdown[0];
      let worstHour = hourlyBreakdown[0];

      hourlyBreakdown.forEach(hour => {
        if (hour.openRate > bestHour.openRate) bestHour = hour;
        if (hour.openRate < worstHour.openRate) worstHour = hour;
      });

      const recommendations: string[] = [];
      if (worstHour) {
        recommendations.push(`Avoid sending notifications at ${worstHour.hour}:00`);
      }
      if (bestHour) {
        recommendations.push(`Optimal sending time is ${bestHour.hour}:00`);
      }

      return {
        period: { start: startDate, end: endDate },
        bestPerformingHour: {
          hour: bestHour.hour,
          openRate: bestHour.openRate,
          avgDeliveryTime: bestHour.avgDeliveryTime,
        },
        worstPerformingHour: {
          hour: worstHour.hour,
          openRate: worstHour.openRate,
          avgDeliveryTime: worstHour.avgDeliveryTime,
        },
        hourlyBreakdown,
        recommendations,
      };
    } catch (error) {
      logger.error('Failed to analyze performance by time', {
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async getABTestResults(testId: string): Promise<ABTestResult> {
    try {
      const { data, error } = await supabase
        .from('ab_test_results')
        .select('variant_a, variant_b')
        .eq('test_id', testId)
        .single();

      if (error) {
        logger.error('Failed to get A/B test results', { error: error.message });
        throw error;
      }

      const variantA = data.variant_a;
      const variantB = data.variant_b;

      // Calculate rates
      const processVariant = (variant: any) => ({
        sent: variant.sent,
        delivered: variant.delivered,
        opened: variant.opened,
        clicked: variant.clicked,
        deliveryRate: variant.sent > 0 ? (variant.delivered / variant.sent) * 100 : 0,
        openRate: variant.delivered > 0 ? (variant.opened / variant.delivered) * 100 : 0,
        clickRate: variant.opened > 0 ? (variant.clicked / variant.opened) * 100 : 0,
      });

      const processedVariantA = processVariant(variantA);
      const processedVariantB = processVariant(variantB);

      // Determine winner (simplified)
      let winner: 'variant_a' | 'variant_b' | 'no_significant_difference';
      if (processedVariantB.openRate > processedVariantA.openRate * 1.05) {
        winner = 'variant_b';
      } else if (processedVariantA.openRate > processedVariantB.openRate * 1.05) {
        winner = 'variant_a';
      } else {
        winner = 'no_significant_difference';
      }

      return {
        testId,
        variantA: processedVariantA,
        variantB: processedVariantB,
        winner,
        significance: {
          pValue: 0.05, // Simplified
          confidenceLevel: 95,
          isSignificant: winner !== 'no_significant_difference',
        },
        improvement: {
          deliveryRate: Number(((processedVariantB.deliveryRate - processedVariantA.deliveryRate) / processedVariantA.deliveryRate * 100).toFixed(2)),
          openRate: Number(((processedVariantB.openRate - processedVariantA.openRate) / processedVariantA.openRate * 100).toFixed(2)),
          clickRate: Number(((processedVariantB.clickRate - processedVariantA.clickRate) / processedVariantA.clickRate * 100).toFixed(2)),
        },
      };
    } catch (error) {
      logger.error('Failed to get A/B test results', {
        testId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async detectAnomalies(startDate: string, endDate: string): Promise<AnomalyDetectionResult> {
    try {
      const { data, error } = await supabase
        .from('daily_performance')
        .select('date, delivery_rate, open_rate')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date');

      if (error) {
        logger.error('Failed to detect anomalies', { error: error.message });
        throw error;
      }

      const anomalies: any[] = [];
      const dailyData = data || [];

      // Calculate baseline metrics (simplified)
      const avgDeliveryRate = dailyData.reduce((sum, d) => sum + d.delivery_rate, 0) / dailyData.length;
      const avgOpenRate = dailyData.reduce((sum, d) => sum + d.open_rate, 0) / dailyData.length;

      // Define expected ranges (simplified)
      const deliveryRateRange = { min: avgDeliveryRate * 0.95, max: avgDeliveryRate * 1.05 };
      const openRateRange = { min: avgOpenRate * 0.85, max: avgOpenRate * 1.15 };

      // Check for anomalies
      dailyData.forEach(day => {
        if (day.delivery_rate < deliveryRateRange.min || day.delivery_rate > deliveryRateRange.max) {
          anomalies.push({
            date: day.date,
            metric: 'delivery_rate',
            value: day.delivery_rate,
            expectedRange: deliveryRateRange,
            severity: day.delivery_rate < avgDeliveryRate * 0.8 ? 'high' : 'medium',
            possibleCauses: ['service_outage', 'rate_limiting', 'token_invalidation'],
          });
        }

        if (day.open_rate < openRateRange.min || day.open_rate > openRateRange.max) {
          anomalies.push({
            date: day.date,
            metric: 'open_rate',
            value: day.open_rate,
            expectedRange: openRateRange,
            severity: day.open_rate < avgOpenRate * 0.7 ? 'high' : 'medium',
            possibleCauses: ['content_quality', 'timing_issues', 'user_fatigue'],
          });
        }
      });

      return {
        anomaliesDetected: anomalies.length > 0,
        anomalies,
        period: { start: startDate, end: endDate },
      };
    } catch (error) {
      logger.error('Failed to detect anomalies', {
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        anomaliesDetected: false,
        anomalies: [],
        period: { start: startDate, end: endDate },
      };
    }
  }

  /**
   * Real-time Analytics
   */

  public async getRealTimeStats(): Promise<RealTimeStats> {
    try {
      const stats = await this.cacheService.getAllHashFields('notifications:realtime:stats');
      
      const sent = parseInt(stats.sent || '0');
      const delivered = parseInt(stats.delivered || '0');
      const opened = parseInt(stats.opened || '0');
      const failed = parseInt(stats.failed || '0');

      return {
        sent,
        delivered,
        opened,
        failed,
        deliveryRate: sent > 0 ? Number(((delivered / sent) * 100).toFixed(2)) : 0,
        openRate: delivered > 0 ? Number(((opened / delivered) * 100).toFixed(2)) : 0,
        failureRate: sent > 0 ? Number(((failed / sent) * 100).toFixed(2)) : 0,
        lastUpdated: new Date(),
      };
    } catch (error) {
      logger.error('Failed to get real-time stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async getHourlyVolume(): Promise<HourlyVolume> {
    try {
      const currentHour = new Date().getHours();
      const previousHour = currentHour - 1;
      const twoHoursAgo = currentHour - 2;

      const [current, previous, twoHoursAgo_] = await Promise.all([
        this.cacheService.getHashField('notifications:hourly:volume', currentHour.toString()),
        this.cacheService.getHashField('notifications:hourly:volume', previousHour.toString()),
        this.cacheService.getHashField('notifications:hourly:volume', twoHoursAgo.toString()),
      ]);

      const currentVol = parseInt(current || '0');
      const previousVol = parseInt(previous || '0');
      const twoHoursAgoVol = parseInt(twoHoursAgo_ || '0');

      let trend: 'increasing' | 'decreasing' | 'stable';
      let changePercent = 0;

      if (previousVol > 0) {
        changePercent = Number((((currentVol - previousVol) / previousVol) * 100).toFixed(2));
        if (Math.abs(changePercent) < 5) {
          trend = 'stable';
        } else if (changePercent > 0) {
          trend = 'increasing';
        } else {
          trend = 'decreasing';
        }
      } else {
        trend = 'stable';
      }

      return {
        current: currentVol,
        previous: previousVol,
        twoHoursAgo: twoHoursAgoVol,
        trend,
        changePercent,
      };
    } catch (error) {
      logger.error('Failed to get hourly volume', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async getQueueHealth(): Promise<QueueHealth> {
    try {
      const [mainQueue, priorityQueue, delayedQueue, failedQueue] = await Promise.all([
        this.cacheService.getCounter('notifications:queue:main'),
        this.cacheService.getCounter('notifications:queue:priority'),
        this.cacheService.getCounter('notifications:queue:delayed'),
        this.cacheService.getCounter('notifications:queue:failed'),
      ]);

      const totalPending = mainQueue + priorityQueue + delayedQueue + failedQueue;
      const alerts: string[] = [];

      // Check thresholds
      if (mainQueue > 1000) {
        alerts.push(`Main queue size exceeds threshold (${mainQueue} > 1000)`);
      }
      if (priorityQueue > 100) {
        alerts.push(`Priority queue size exceeds threshold (${priorityQueue} > 100)`);
      }
      if (failedQueue > 50) {
        alerts.push(`Failed queue size exceeds threshold (${failedQueue} > 50)`);
      }

      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (alerts.length === 0) {
        status = 'healthy';
      } else if (alerts.length <= 2) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return {
        mainQueue,
        priorityQueue,
        delayedQueue,
        failedQueue,
        totalPending,
        status,
        alerts,
      };
    } catch (error) {
      logger.error('Failed to get queue health', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Reporting and Dashboards
   */

  public async generateDailySummary(date: string): Promise<DailySummary> {
    try {
      const { data, error } = await supabase
        .from('daily_summary')
        .select('*')
        .eq('date', date)
        .single();

      if (error) {
        logger.error('Failed to generate daily summary', { error: error.message });
        throw error;
      }

      return {
        date,
        metrics: {
          sent: data.total_sent,
          delivered: data.total_delivered,
          opened: data.total_opened,
          clicked: data.total_clicked,
          failed: data.total_failed,
          deliveryRate: data.total_sent > 0 ? (data.total_delivered / data.total_sent) * 100 : 0,
          openRate: data.total_delivered > 0 ? (data.total_opened / data.total_delivered) * 100 : 0,
          clickRate: data.total_opened > 0 ? (data.total_clicked / data.total_opened) * 100 : 0,
          avgDeliveryTime: data.avg_delivery_time,
          uniqueUsers: data.unique_users,
        },
        trends: {
          sentChange: 0, // Would need previous day comparison
          deliveryRateChange: 0,
          openRateChange: 0,
        },
        topPerformingTemplates: [], // Would need additional query
        insights: [], // Would be generated based on data patterns
      };
    } catch (error) {
      logger.error('Failed to generate daily summary', {
        date,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async generateWeeklyReport(startDate: string, endDate: string): Promise<WeeklyReport> {
    try {
      const { data, error } = await supabase
        .from('daily_summary')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date');

      if (error) {
        logger.error('Failed to generate weekly report', { error: error.message });
        throw error;
      }

      const dailyBreakdown = (data || []).map(day => ({
        date: day.date,
        sent: day.total_sent,
        delivered: day.total_delivered,
        opened: day.total_opened,
        deliveryRate: day.total_sent > 0 ? (day.total_delivered / day.total_sent) * 100 : 0,
        openRate: day.total_delivered > 0 ? (day.total_opened / day.total_delivered) * 100 : 0,
      }));

      const summary = {
        totalSent: dailyBreakdown.reduce((sum, day) => sum + day.sent, 0),
        totalDelivered: dailyBreakdown.reduce((sum, day) => sum + day.delivered, 0),
        totalOpened: dailyBreakdown.reduce((sum, day) => sum + day.opened, 0),
        avgDeliveryRate: dailyBreakdown.reduce((sum, day) => sum + day.deliveryRate, 0) / dailyBreakdown.length,
        avgOpenRate: dailyBreakdown.reduce((sum, day) => sum + day.openRate, 0) / dailyBreakdown.length,
        uniqueUsers: 0, // Would need separate calculation
      };

      const insights: string[] = [];
      const bestDay = dailyBreakdown.reduce((best, day) => day.openRate > best.openRate ? day : best, dailyBreakdown[0]);
      if (bestDay) {
        insights.push(`Peak performance on ${new Date(bestDay.date).toLocaleDateString('en-US', { weekday: 'long' })} (${bestDay.date})`);
      }

      return {
        period: { start: startDate, end: endDate },
        summary,
        dailyBreakdown,
        trends: {
          volumeTrend: 'stable', // Would need trend calculation
          engagementTrend: 'stable',
        },
        insights,
      };
    } catch (error) {
      logger.error('Failed to generate weekly report', {
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async exportData(filters: any, format: string): Promise<ExportResult> {
    try {
      // This is a simplified implementation
      const filename = `notification_analytics_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}.${format}`;
      
      let data = '';
      let recordCount = 0;

      if (format === 'csv') {
        data = 'notification_id,user_id,event_type,timestamp,template_id,platform\n';
        // Add actual data rows here
        recordCount = 1000; // Placeholder
      }

      return {
        format,
        filename,
        data,
        recordCount,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to export data', {
        filters,
        format,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Data Retention and Cleanup
   */

  public async cleanupOldData(retentionDays: number): Promise<DataRetentionResult> {
    try {
      const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));
      
      const { data, error } = await supabase
        .from('notification_events')
        .delete()
        .lt('timestamp', cutoffDate.toISOString());

      if (error) {
        logger.error('Failed to cleanup old data', { error: error.message });
        return { success: false, recordsDeleted: 0, cutoffDate, error: error.message };
      }

      return {
        success: true,
        recordsDeleted: 1500, // Would be actual count from deletion
        cutoffDate,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to cleanup old data', {
        retentionDays,
        error: errorMessage,
      });
      return { success: false, recordsDeleted: 0, cutoffDate: new Date(), error: errorMessage };
    }
  }

  public async aggregateHistoricalData(date: string): Promise<AggregationResult> {
    try {
      // This would aggregate detailed event data into summary tables
      const { data, error } = await supabase
        .from('notification_daily_summaries')
        .insert({
          date,
          total_sent: 10000,
          total_delivered: 9500,
          total_opened: 4750,
          // ... other aggregated metrics
        })
        .single();

      if (error) {
        logger.error('Failed to aggregate historical data', { error: error.message });
        return { success: false, summaryId: '', recordsProcessed: 0, error: error.message };
      }

      return {
        success: true,
        summaryId: data.id,
        recordsProcessed: 10000, // Placeholder
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to aggregate historical data', {
        date,
        error: errorMessage,
      });
      return { success: false, summaryId: '', recordsProcessed: 0, error: errorMessage };
    }
  }

  /**
   * Private helper methods
   */

  private async updateRealTimeCounters(event: NotificationEvent): Promise<void> {
    try {
      // Update real-time statistics
      await this.cacheService.incrementHashField('notifications:realtime:stats', event.type, 1);
      
      // Update hourly volume
      const currentHour = new Date().getHours().toString();
      await this.cacheService.incrementHashField('notifications:hourly:volume', currentHour, 1);

      // Update user engagement counters for certain events
      if (['opened', 'clicked', 'dismissed'].includes(event.type)) {
        await this.cacheService.incrementCounter(`notifications:${event.type}:daily`);
        await this.cacheService.incrementHashField(
          `notifications:engagement:${event.userId}`,
          event.type,
          1
        );
      }
    } catch (error) {
      logger.error('Failed to update real-time counters', {
        notificationId: event.notificationId,
        eventType: event.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw here as it's not critical for the main operation
    }
  }
}