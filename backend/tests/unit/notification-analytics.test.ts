/**
 * Notification Analytics Service Unit Tests
 * Tests for tracking notification delivery, engagement, performance metrics, and insights
 */

import { NotificationAnalyticsService } from '../../src/services/notificationAnalyticsService';
import { supabase } from '../../src/services/supabase';
import { getRedisCacheService } from '../../src/services/redisCacheService';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/services/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
    data: null,
    error: null
  }
}));

jest.mock('../../src/services/redisCacheService', () => ({
  getRedisCacheService: jest.fn(() => ({
    incrementCounter: jest.fn().mockResolvedValue(1),
    getCounter: jest.fn().mockResolvedValue(0),
    setCounter: jest.fn().mockResolvedValue('OK'),
    incrementHashField: jest.fn().mockResolvedValue(1),
    getHashField: jest.fn().mockResolvedValue('0'),
    getAllHashFields: jest.fn().mockResolvedValue({}),
    setWithExpiry: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    isReady: jest.fn().mockReturnValue(true)
  }))
}));

jest.mock('../../src/utils/logger');

describe('NotificationAnalyticsService', () => {
  let analyticsService: NotificationAnalyticsService;
  let mockSupabase: any;
  let mockCacheService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = require('../../src/services/supabase').supabase;
    mockCacheService = getRedisCacheService();
    analyticsService = new NotificationAnalyticsService();
  });

  describe('Event Tracking', () => {
    it('should track notification sent event', async () => {
      const event = {
        notificationId: 'notif-123',
        userId: 'user-456',
        type: 'sent',
        templateId: 'like_notification',
        platform: 'android',
        metadata: {
          deviceToken: 'device-token-123',
          messageId: 'fcm-msg-456'
        }
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'event-123',
          ...event,
          timestamp: new Date()
        },
        error: null
      });

      const result = await analyticsService.trackEvent(event);

      expect(mockSupabase.from).toHaveBeenCalledWith('notification_events');
      expect(mockSupabase.insert).toHaveBeenCalledWith({
        notification_id: event.notificationId,
        user_id: event.userId,
        event_type: event.type,
        template_id: event.templateId,
        platform: event.platform,
        metadata: event.metadata,
        timestamp: expect.any(Date)
      });
      expect(result.success).toBe(true);
      expect(result.eventId).toBe('event-123');
    });

    it('should track notification delivered event', async () => {
      const event = {
        notificationId: 'notif-123',
        userId: 'user-456',
        type: 'delivered',
        platform: 'ios',
        metadata: {
          apnsId: 'apns-response-123',
          deliveryTime: '2024-01-15T10:30:00Z'
        }
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'event-456', ...event },
        error: null
      });

      const result = await analyticsService.trackEvent(event);

      expect(result.success).toBe(true);
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'delivered'
        })
      );
    });

    it('should track notification opened event', async () => {
      const event = {
        notificationId: 'notif-123',
        userId: 'user-456',
        type: 'opened',
        platform: 'web',
        metadata: {
          openedAt: '2024-01-15T10:32:00Z',
          actionTaken: 'view_post'
        }
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'event-789', ...event },
        error: null
      });

      // Should also increment engagement counters
      const result = await analyticsService.trackEvent(event);

      expect(result.success).toBe(true);
      expect(mockCacheService.incrementCounter).toHaveBeenCalledWith('notifications:opened:daily');
      expect(mockCacheService.incrementHashField).toHaveBeenCalledWith(
        'notifications:engagement:user-456',
        'opened',
        1
      );
    });

    it('should track notification dismissed event', async () => {
      const event = {
        notificationId: 'notif-123',
        userId: 'user-456',
        type: 'dismissed',
        platform: 'android',
        metadata: {
          dismissedAt: '2024-01-15T10:35:00Z',
          dismissReason: 'swipe'
        }
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'event-abc', ...event },
        error: null
      });

      const result = await analyticsService.trackEvent(event);

      expect(result.success).toBe(true);
      expect(mockCacheService.incrementCounter).toHaveBeenCalledWith('notifications:dismissed:daily');
    });

    it('should handle event tracking errors gracefully', async () => {
      const event = {
        notificationId: 'notif-123',
        userId: 'user-456',
        type: 'sent',
        templateId: 'like_notification',
        platform: 'android'
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' }
      });

      const result = await analyticsService.trackEvent(event);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
      expect(logger.error).toHaveBeenCalledWith('Failed to track notification event', expect.any(Object));
    });
  });

  describe('Delivery Metrics', () => {
    it('should calculate delivery rates by platform', async () => {
      const mockEvents = {
        data: [
          { platform: 'android', event_type: 'sent', count: 100 },
          { platform: 'android', event_type: 'delivered', count: 95 },
          { platform: 'android', event_type: 'failed', count: 5 },
          { platform: 'ios', event_type: 'sent', count: 80 },
          { platform: 'ios', event_type: 'delivered', count: 78 },
          { platform: 'ios', event_type: 'failed', count: 2 }
        ],
        error: null
      };

      mockSupabase.eq.mockResolvedValueOnce(mockEvents);

      const result = await analyticsService.getDeliveryRates('2024-01-15', '2024-01-16');

      expect(result).toEqual({
        android: {
          sent: 100,
          delivered: 95,
          failed: 5,
          deliveryRate: 95,
          failureRate: 5
        },
        ios: {
          sent: 80,
          delivered: 78,
          failed: 2,
          deliveryRate: 97.5,
          failureRate: 2.5
        },
        overall: {
          sent: 180,
          delivered: 173,
          failed: 7,
          deliveryRate: 96.11,
          failureRate: 3.89
        }
      });
    });

    it('should get delivery performance metrics', async () => {
      const mockMetrics = {
        data: [
          { 
            template_id: 'like_notification',
            platform: 'android',
            sent_count: 1000,
            delivered_count: 950,
            opened_count: 380,
            avg_delivery_time_ms: 1500
          },
          {
            template_id: 'comment_notification',
            platform: 'ios',
            sent_count: 800,
            delivered_count: 790,
            opened_count: 420,
            avg_delivery_time_ms: 1200
          }
        ],
        error: null
      };

      mockSupabase.eq.mockResolvedValueOnce(mockMetrics);

      const result = await analyticsService.getDeliveryPerformance('2024-01-15', '2024-01-16');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        templateId: 'like_notification',
        platform: 'android',
        sent: 1000,
        delivered: 950,
        opened: 380,
        deliveryRate: 95,
        openRate: 40, // 380/950 * 100
        avgDeliveryTime: 1500
      });
    });

    it('should track delivery time distribution', async () => {
      const mockDistribution = {
        data: [
          { delivery_time_bucket: '0-1s', count: 450 },
          { delivery_time_bucket: '1-3s', count: 320 },
          { delivery_time_bucket: '3-5s', count: 180 },
          { delivery_time_bucket: '5-10s', count: 40 },
          { delivery_time_bucket: '10s+', count: 10 }
        ],
        error: null
      };

      mockSupabase.eq.mockResolvedValueOnce(mockDistribution);

      const result = await analyticsService.getDeliveryTimeDistribution('android', '2024-01-15', '2024-01-16');

      expect(result.platform).toBe('android');
      expect(result.distribution).toEqual({
        '0-1s': 450,
        '1-3s': 320,
        '3-5s': 180,
        '5-10s': 40,
        '10s+': 10
      });
      expect(result.totalNotifications).toBe(1000);
    });
  });

  describe('Engagement Analytics', () => {
    it('should calculate engagement rates by notification type', async () => {
      const mockEngagement = {
        data: [
          { template_id: 'like_notification', delivered: 1000, opened: 400, clicked: 120 },
          { template_id: 'comment_notification', delivered: 800, opened: 480, clicked: 200 },
          { template_id: 'follow_notification', delivered: 600, opened: 180, clicked: 90 },
          { template_id: 'milestone_reminder', delivered: 400, opened: 280, clicked: 160 }
        ],
        error: null
      };

      mockSupabase.eq.mockResolvedValueOnce(mockEngagement);

      const result = await analyticsService.getEngagementRates('2024-01-15', '2024-01-16');

      expect(result).toEqual({
        like_notification: {
          delivered: 1000,
          opened: 400,
          clicked: 120,
          openRate: 40,
          clickRate: 12,
          clickThroughRate: 30 // clicks/opens * 100
        },
        comment_notification: {
          delivered: 800,
          opened: 480,
          clicked: 200,
          openRate: 60,
          clickRate: 25,
          clickThroughRate: 41.67
        },
        follow_notification: {
          delivered: 600,
          opened: 180,
          clicked: 90,
          openRate: 30,
          clickRate: 15,
          clickThroughRate: 50
        },
        milestone_reminder: {
          delivered: 400,
          opened: 280,
          clicked: 160,
          openRate: 70,
          clickRate: 40,
          clickThroughRate: 57.14
        }
      });
    });

    it('should track user engagement patterns', async () => {
      const userId = 'user-123';
      const mockUserEngagement = {
        data: {
          total_notifications: 50,
          opened_notifications: 32,
          clicked_notifications: 18,
          dismissed_notifications: 8,
          avg_time_to_open_ms: 7200000, // 2 hours
          most_engaged_time: '19:00',
          most_engaged_day: 'Tuesday',
          preferred_notification_types: ['milestone_reminder', 'comment_notification']
        },
        error: null
      };

      mockSupabase.single.mockResolvedValueOnce(mockUserEngagement);

      const result = await analyticsService.getUserEngagementPattern(userId, '2024-01-01', '2024-01-31');

      expect(result).toEqual({
        userId,
        totalNotifications: 50,
        openRate: 64, // 32/50 * 100
        clickRate: 36, // 18/50 * 100
        dismissRate: 16, // 8/50 * 100
        avgTimeToOpen: 7200000,
        mostEngagedTime: '19:00',
        mostEngagedDay: 'Tuesday',
        preferredTypes: ['milestone_reminder', 'comment_notification']
      });
    });

    it('should identify notification fatigue indicators', async () => {
      const userId = 'user-456';
      const mockFatigueData = {
        data: [
          { week: '2024-W01', open_rate: 65, click_rate: 25 },
          { week: '2024-W02', open_rate: 58, click_rate: 22 },
          { week: '2024-W03', open_rate: 45, click_rate: 18 },
          { week: '2024-W04', open_rate: 35, click_rate: 12 }
        ],
        error: null
      };

      mockSupabase.eq.mockResolvedValueOnce(mockFatigueData);

      const result = await analyticsService.analyzeFatigue(userId);

      expect(result.hasFatigue).toBe(true);
      expect(result.severity).toBe('moderate'); // Based on declining engagement
      expect(result.indicators).toContain('declining_open_rate');
      expect(result.indicators).toContain('declining_click_rate');
      expect(result.recommendations).toContain('reduce_frequency');
      expect(result.recommendations).toContain('improve_relevance');
    });
  });

  describe('Performance Insights', () => {
    it('should analyze notification performance by time of day', async () => {
      const mockTimeAnalysis = {
        data: [
          { hour: 8, sent: 100, opened: 75, avg_delivery_time: 800 },
          { hour: 12, sent: 150, opened: 90, avg_delivery_time: 1200 },
          { hour: 18, sent: 200, opened: 160, avg_delivery_time: 600 },
          { hour: 22, sent: 80, opened: 32, avg_delivery_time: 2000 }
        ],
        error: null
      };

      mockSupabase.eq.mockResolvedValueOnce(mockTimeAnalysis);

      const result = await analyticsService.analyzePerformanceByTime('2024-01-15', '2024-01-16');

      expect(result.bestPerformingHour).toEqual({
        hour: 18,
        openRate: 80,
        avgDeliveryTime: 600
      });
      expect(result.worstPerformingHour).toEqual({
        hour: 22,
        openRate: 40,
        avgDeliveryTime: 2000
      });
      expect(result.recommendations).toContain('Avoid sending notifications at 22:00');
      expect(result.recommendations).toContain('Optimal sending time is 18:00');
    });

    it('should provide A/B test performance comparison', async () => {
      const testId = 'template-test-123';
      const mockABResults = {
        data: {
          variant_a: {
            sent: 500,
            delivered: 485,
            opened: 220,
            clicked: 88
          },
          variant_b: {
            sent: 500,
            delivered: 490,
            opened: 245,
            clicked: 110
          }
        },
        error: null
      };

      mockSupabase.single.mockResolvedValueOnce(mockABResults);

      const result = await analyticsService.getABTestResults(testId);

      expect(result).toEqual({
        testId,
        variantA: {
          sent: 500,
          delivered: 485,
          opened: 220,
          clicked: 88,
          deliveryRate: 97,
          openRate: 45.36,
          clickRate: 40
        },
        variantB: {
          sent: 500,
          delivered: 490,
          opened: 245,
          clicked: 110,
          deliveryRate: 98,
          openRate: 50,
          clickRate: 44.90
        },
        winner: 'variant_b',
        significance: expect.any(Object),
        improvement: {
          deliveryRate: 1.03,
          openRate: 10.22,
          clickRate: 12.25
        }
      });
    });

    it('should detect and report anomalies in notification performance', async () => {
      const mockAnomalyData = {
        data: [
          { date: '2024-01-10', delivery_rate: 95, open_rate: 45 },
          { date: '2024-01-11', delivery_rate: 94, open_rate: 44 },
          { date: '2024-01-12', delivery_rate: 96, open_rate: 46 },
          { date: '2024-01-13', delivery_rate: 75, open_rate: 28 }, // Anomaly
          { date: '2024-01-14', delivery_rate: 95, open_rate: 45 },
          { date: '2024-01-15', delivery_rate: 94, open_rate: 44 }
        ],
        error: null
      };

      mockSupabase.eq.mockResolvedValueOnce(mockAnomalyData);

      const result = await analyticsService.detectAnomalies('2024-01-10', '2024-01-15');

      expect(result.anomaliesDetected).toBe(true);
      expect(result.anomalies).toHaveLength(1);
      expect(result.anomalies[0]).toEqual({
        date: '2024-01-13',
        metric: 'delivery_rate',
        value: 75,
        expectedRange: { min: 92, max: 98 },
        severity: 'high',
        possibleCauses: ['service_outage', 'rate_limiting', 'token_invalidation']
      });
    });
  });

  describe('Real-time Analytics', () => {
    it('should provide real-time notification statistics', async () => {
      mockCacheService.getAllHashFields.mockResolvedValue({
        sent: '1500',
        delivered: '1425',
        opened: '640',
        failed: '75'
      });

      const result = await analyticsService.getRealTimeStats();

      expect(result).toEqual({
        sent: 1500,
        delivered: 1425,
        opened: 640,
        failed: 75,
        deliveryRate: 95,
        openRate: 44.91,
        failureRate: 5,
        lastUpdated: expect.any(Date)
      });
    });

    it('should track hourly notification volume', async () => {
      mockCacheService.getHashField
        .mockResolvedValueOnce('150') // Current hour
        .mockResolvedValueOnce('180') // Previous hour
        .mockResolvedValueOnce('120'); // Two hours ago

      const result = await analyticsService.getHourlyVolume();

      expect(result).toEqual({
        current: 150,
        previous: 180,
        twoHoursAgo: 120,
        trend: 'decreasing', // 150 < 180
        changePercent: -16.67
      });
    });

    it('should monitor notification queue health', async () => {
      mockCacheService.getCounter
        .mockResolvedValueOnce(25) // Main queue
        .mockResolvedValueOnce(5)  // Priority queue
        .mockResolvedValueOnce(10) // Delayed queue
        .mockResolvedValueOnce(3); // Failed queue

      const result = await analyticsService.getQueueHealth();

      expect(result).toEqual({
        mainQueue: 25,
        priorityQueue: 5,
        delayedQueue: 10,
        failedQueue: 3,
        totalPending: 43,
        status: 'healthy',
        alerts: []
      });
    });

    it('should alert on queue health issues', async () => {
      mockCacheService.getCounter
        .mockResolvedValueOnce(1500) // Main queue (high)
        .mockResolvedValueOnce(200)  // Priority queue (high)
        .mockResolvedValueOnce(50)   // Delayed queue
        .mockResolvedValueOnce(100); // Failed queue (high)

      const result = await analyticsService.getQueueHealth();

      expect(result.status).toBe('degraded');
      expect(result.alerts).toContain('Main queue size exceeds threshold (1500 > 1000)');
      expect(result.alerts).toContain('Priority queue size exceeds threshold (200 > 100)');
      expect(result.alerts).toContain('Failed queue size exceeds threshold (100 > 50)');
    });
  });

  describe('Reporting and Dashboards', () => {
    it('should generate daily notification summary report', async () => {
      const date = '2024-01-15';
      
      mockSupabase.eq.mockResolvedValueOnce({
        data: {
          total_sent: 5000,
          total_delivered: 4750,
          total_opened: 2280,
          total_clicked: 912,
          total_failed: 250,
          avg_delivery_time: 1800,
          unique_users: 1250
        },
        error: null
      });

      const result = await analyticsService.generateDailySummary(date);

      expect(result).toEqual({
        date,
        metrics: {
          sent: 5000,
          delivered: 4750,
          opened: 2280,
          clicked: 912,
          failed: 250,
          deliveryRate: 95,
          openRate: 48,
          clickRate: 40,
          avgDeliveryTime: 1800,
          uniqueUsers: 1250
        },
        trends: expect.any(Object),
        topPerformingTemplates: expect.any(Array),
        insights: expect.any(Array)
      });
    });

    it('should generate weekly performance report', async () => {
      const startDate = '2024-01-08';
      const endDate = '2024-01-14';

      mockSupabase.gte.mockReturnValueOnce({
        lte: jest.fn().mockResolvedValueOnce({
          data: [
            { date: '2024-01-08', sent: 800, delivered: 760, opened: 380 },
            { date: '2024-01-09', sent: 850, delivered: 825, opened: 412 },
            { date: '2024-01-10', sent: 780, delivered: 750, opened: 345 },
            { date: '2024-01-11', sent: 900, delivered: 855, opened: 445 },
            { date: '2024-01-12', sent: 720, delivered: 700, opened: 315 },
            { date: '2024-01-13', sent: 650, delivered: 630, opened: 284 },
            { date: '2024-01-14', sent: 880, delivered: 845, opened: 422 }
          ],
          error: null
        })
      });

      const result = await analyticsService.generateWeeklyReport(startDate, endDate);

      expect(result.period).toEqual({ start: startDate, end: endDate });
      expect(result.summary.totalSent).toBe(5580);
      expect(result.summary.avgDeliveryRate).toBeCloseTo(95.66);
      expect(result.dailyBreakdown).toHaveLength(7);
      expect(result.insights).toContain('Peak performance on Friday (2024-01-11)');
    });

    it('should export analytics data in various formats', async () => {
      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        platform: 'android',
        templateId: 'like_notification'
      };

      const result = await analyticsService.exportData(filters, 'csv');

      expect(result.format).toBe('csv');
      expect(result.filename).toMatch(/notification_analytics_\d{8}_\d{6}\.csv/);
      expect(result.data).toContain('notification_id,user_id,event_type,timestamp');
      expect(result.recordCount).toBeGreaterThan(0);
    });
  });

  describe('Data Retention and Cleanup', () => {
    it('should clean up old analytics data based on retention policy', async () => {
      const retentionDays = 90;
      const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));

      mockSupabase.eq.mockResolvedValueOnce({
        data: null,
        error: null,
        count: 1500 // Records deleted
      });

      const result = await analyticsService.cleanupOldData(retentionDays);

      expect(result.success).toBe(true);
      expect(result.recordsDeleted).toBe(1500);
      expect(result.cutoffDate).toEqual(cutoffDate);
    });

    it('should aggregate old data into summary tables', async () => {
      const aggregationDate = '2024-01-01';

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'summary-123',
          date: aggregationDate,
          total_sent: 10000,
          total_delivered: 9500,
          total_opened: 4750
        },
        error: null
      });

      const result = await analyticsService.aggregateHistoricalData(aggregationDate);

      expect(result.success).toBe(true);
      expect(result.summaryId).toBe('summary-123');
      expect(mockSupabase.from).toHaveBeenCalledWith('notification_daily_summaries');
    });
  });
});