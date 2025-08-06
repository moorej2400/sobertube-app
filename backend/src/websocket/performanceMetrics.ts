/**
 * WebSocket Performance Metrics
 * Real-time monitoring and alerting for WebSocket performance
 */

import { logger } from '../utils/logger';

export interface PerformanceMetricsConfig {
  metricsInterval: number;
  retentionPeriod: number;
  alertThresholds: {
    connectionCount: number;
    memoryUsage: number;
    responseTime: number;
    errorRate: number;
  };
}

export interface ConnectionEvent {
  type: 'connect' | 'disconnect' | 'bulk_connect';
  userId?: string;
  socketId?: string;
  count?: number;
}

export interface MessageEvent {
  type: 'sent' | 'received';
  size: number;
  messageType: string;
}

export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface CurrentMetrics {
  connectionsPerSecond: number;
  disconnectionsPerSecond: number;
  activeConnections: number;
  timestamp: Date;
}

export interface ThroughputMetrics {
  messagesPerSecond: number;
  bytesPerSecond: number;
  averageMessageSize: number;
  messageTypes: Record<string, number>;
}

export interface MemoryMetrics {
  heapUtilization: number;
  memoryGrowthRate: number;
  gcFrequency: number;
}

export interface PerformanceAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  value: number;
  threshold: number;
  timestamp: Date;
  message?: string;
  trend?: 'increasing' | 'decreasing' | 'stable';
}

export interface PerformanceScore {
  overall: number;
  breakdown: {
    responseTime: number;
    errorRate: number;
    throughput: number;
    memoryUsage: number;
  };
}

export interface MetricSnapshot {
  timestamp: Date;
  connections: number;
  responseTime: number;
  throughput: number;
  errorRate: number;
  memoryUsage: number;
}

export interface HistoricalData {
  snapshots: MetricSnapshot[];
  trends: {
    responseTime: 'increasing' | 'decreasing' | 'stable';
    throughput: 'increasing' | 'decreasing' | 'stable';
    errorRate: 'increasing' | 'decreasing' | 'stable';
  };
}

export class PerformanceMetrics {
  private config: PerformanceMetricsConfig;
  private metricsInterval: NodeJS.Timeout | null = null;
  
  // Connection tracking
  private connectionEvents: ConnectionEvent[] = [];
  private activeConnections = 0;
  
  // Message tracking
  private messageEvents: MessageEvent[] = [];
  private messageTypeCounters: Record<string, number> = {};
  
  // Performance tracking
  private responseTimes: number[] = [];
  private errorCount = 0;
  private totalRequests = 0;
  private memorySnapshots: MemoryUsage[] = [];
  
  // Historical data
  private historicalSnapshots: MetricSnapshot[] = [];
  
  // Alert callbacks
  private alertCallbacks: Array<(alert: PerformanceAlert) => void> = [];

  constructor(config: PerformanceMetricsConfig) {
    this.config = config;
    
    // Start metrics collection interval
    this.startMetricsCollection();
    
    logger.info('Performance metrics initialized', {
      component: 'PerformanceMetrics',
      config: this.config
    });
  }

  /**
   * Record a connection event
   */
  public recordConnectionEvent(type: ConnectionEvent['type'], data: Omit<ConnectionEvent, 'type'>): void {
    const event: ConnectionEvent = { type, ...data };
    this.connectionEvents.push(event);
    
    // Update active connections count
    if (type === 'connect') {
      this.activeConnections++;
    } else if (type === 'disconnect') {
      this.activeConnections--;
    } else if (type === 'bulk_connect' && data.count) {
      this.activeConnections += data.count;
    }

    // Check for alerts
    this.checkConnectionAlerts();

    // Clean old events (keep only last minute)
    const oneMinuteAgo = Date.now() - 60000;
    this.connectionEvents = this.connectionEvents.filter(e => 
      (e as any).timestamp > oneMinuteAgo
    );
  }

  /**
   * Record a message event
   */
  public recordMessageEvent(type: MessageEvent['type'], data: Omit<MessageEvent, 'type'>): void {
    const event: MessageEvent = { type, ...data };
    this.messageEvents.push(event);

    // Update message type counters
    this.messageTypeCounters[data.messageType] = (this.messageTypeCounters[data.messageType] || 0) + 1;

    // Clean old events (keep only last minute)
    const oneMinuteAgo = Date.now() - 60000;
    this.messageEvents = this.messageEvents.filter(e => 
      (e as any).timestamp > oneMinuteAgo
    );
  }

  /**
   * Record response time
   */
  public recordResponseTime(responseTimeMs: number): void {
    this.responseTimes.push(responseTimeMs);
    this.totalRequests++;

    // Keep only recent response times
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-500);
    }

    // Check for performance alerts
    this.checkResponseTimeAlerts(responseTimeMs);
  }

  /**
   * Record error rate
   */
  public recordError(): void {
    this.errorCount++;
    this.totalRequests++;
    
    const errorRate = this.errorCount / this.totalRequests;
    this.checkErrorRateAlerts(errorRate);
  }

  /**
   * Record throughput
   */
  public recordThroughput(messagesPerSecond: number): void {
    // Store throughput data for analysis
    const event: MessageEvent = {
      type: 'sent',
      size: messagesPerSecond, // Use the parameter as message size for tracking
      messageType: 'throughput_record'
    };
    this.messageEvents.push(event);
  }

  /**
   * Record memory usage
   */
  public recordMemoryUsage(memoryUsage: MemoryUsage): void {
    this.memorySnapshots.push(memoryUsage);

    // Keep only recent snapshots
    if (this.memorySnapshots.length > 100) {
      this.memorySnapshots = this.memorySnapshots.slice(-50);
    }

    // Check memory alerts
    const heapUtilization = memoryUsage.heapUsed / memoryUsage.heapTotal;
    this.checkMemoryAlerts(heapUtilization);
  }

  /**
   * Get current metrics
   */
  public getCurrentMetrics(): CurrentMetrics {
    const lastMinuteEvents = this.connectionEvents.filter(e => 
      (Date.now() - (e as any).timestamp || 0) < 60000
    );

    const connectEvents = lastMinuteEvents.filter(e => e.type === 'connect').length;
    const disconnectEvents = lastMinuteEvents.filter(e => e.type === 'disconnect').length;

    return {
      connectionsPerSecond: connectEvents / 60,
      disconnectionsPerSecond: disconnectEvents / 60,
      activeConnections: this.activeConnections,
      timestamp: new Date()
    };
  }

  /**
   * Get throughput metrics
   */
  public getThroughputMetrics(): ThroughputMetrics {
    const lastMinuteMessages = this.messageEvents.filter(e => 
      (Date.now() - (e as any).timestamp || 0) < 60000
    );

    const totalBytes = lastMinuteMessages.reduce((sum, msg) => sum + msg.size, 0);
    const messageCount = lastMinuteMessages.length;

    return {
      messagesPerSecond: messageCount / 60,
      bytesPerSecond: totalBytes / 60,
      averageMessageSize: messageCount > 0 ? totalBytes / messageCount : 0,
      messageTypes: { ...this.messageTypeCounters }
    };
  }

  /**
   * Get memory metrics
   */
  public getMemoryMetrics(): MemoryMetrics {
    if (this.memorySnapshots.length === 0) {
      return {
        heapUtilization: 0,
        memoryGrowthRate: 0,
        gcFrequency: 0
      };
    }

    const latest = this.memorySnapshots[this.memorySnapshots.length - 1];
    const heapUtilization = latest.heapUsed / latest.heapTotal;

    // Calculate growth rate if we have multiple snapshots
    let memoryGrowthRate = 0;
    if (this.memorySnapshots.length > 1) {
      const oldest = this.memorySnapshots[0];
      const timeDiff = this.memorySnapshots.length; // Approximate time periods
      memoryGrowthRate = (latest.heapUsed - oldest.heapUsed) / timeDiff;
    }

    return {
      heapUtilization,
      memoryGrowthRate,
      gcFrequency: 0 // Placeholder - would need GC monitoring
    };
  }

  /**
   * Check connection-related alerts
   */
  private checkConnectionAlerts(): void {
    if (this.activeConnections > this.config.alertThresholds.connectionCount) {
      this.triggerAlert({
        type: 'connection_count_high',
        severity: 'warning',
        value: this.activeConnections,
        threshold: this.config.alertThresholds.connectionCount,
        timestamp: new Date(),
        message: `Active connections (${this.activeConnections}) exceed threshold`
      });
    }
  }

  /**
   * Check response time alerts
   */
  private checkResponseTimeAlerts(responseTime: number): void {
    if (responseTime > this.config.alertThresholds.responseTime) {
      this.triggerAlert({
        type: 'response_time_high',
        severity: 'warning',
        value: responseTime,
        threshold: this.config.alertThresholds.responseTime,
        timestamp: new Date(),
        message: `Response time (${responseTime}ms) exceeds threshold`
      });
    }
  }

  /**
   * Check error rate alerts
   */
  private checkErrorRateAlerts(errorRate: number): void {
    if (errorRate > this.config.alertThresholds.errorRate) {
      this.triggerAlert({
        type: 'error_rate_high',
        severity: 'critical',
        value: errorRate,
        threshold: this.config.alertThresholds.errorRate,
        timestamp: new Date(),
        message: `Error rate (${(errorRate * 100).toFixed(2)}%) exceeds threshold`
      });
    }
  }

  /**
   * Check memory usage alerts
   */
  private checkMemoryAlerts(heapUtilization: number): void {
    if (heapUtilization > this.config.alertThresholds.memoryUsage) {
      this.triggerAlert({
        type: 'memory_usage_high',
        severity: 'critical',
        value: heapUtilization,
        threshold: this.config.alertThresholds.memoryUsage,
        timestamp: new Date(),
        message: `Memory usage (${(heapUtilization * 100).toFixed(2)}%) exceeds threshold`
      });
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(alert: PerformanceAlert): void {
    logger.warn('Performance alert triggered', {
      component: 'PerformanceMetrics',
      alert
    });

    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        logger.error('Error in alert callback', {
          component: 'PerformanceMetrics',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  /**
   * Register alert callback
   */
  public onAlert(callback: (alert: PerformanceAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Check performance trends
   */
  public checkPerformanceTrends(): PerformanceAlert | null {
    if (this.responseTimes.length < 5) {
      return null; // Not enough data
    }

    const recentTimes = this.responseTimes.slice(-5);
    const isIncreasing = recentTimes.every((time, i) => 
      i === 0 || time > recentTimes[i - 1]
    );

    if (isIncreasing) {
      return {
        type: 'performance_degradation',
        severity: 'warning',
        value: recentTimes[recentTimes.length - 1],
        threshold: recentTimes[0],
        timestamp: new Date(),
        trend: 'increasing',
        message: 'Consistent increase in response times detected'
      };
    }

    return null;
  }

  /**
   * Calculate overall performance score
   */
  public calculatePerformanceScore(): PerformanceScore {
    const responseTimeScore = this.calculateResponseTimeScore();
    const errorRateScore = this.calculateErrorRateScore();
    const throughputScore = this.calculateThroughputScore();
    const memoryScore = this.calculateMemoryScore();

    const overall = (responseTimeScore + errorRateScore + throughputScore + memoryScore) / 4;

    return {
      overall: Math.round(overall),
      breakdown: {
        responseTime: Math.round(responseTimeScore),
        errorRate: Math.round(errorRateScore),
        throughput: Math.round(throughputScore),
        memoryUsage: Math.round(memoryScore)
      }
    };
  }

  private calculateResponseTimeScore(): number {
    if (this.responseTimes.length === 0) return 100;
    
    const avgResponseTime = this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
    const threshold = this.config.alertThresholds.responseTime;
    
    return Math.max(0, 100 - (avgResponseTime / threshold) * 100);
  }

  private calculateErrorRateScore(): number {
    if (this.totalRequests === 0) return 100;
    
    const errorRate = this.errorCount / this.totalRequests;
    const threshold = this.config.alertThresholds.errorRate;
    
    return Math.max(0, 100 - (errorRate / threshold) * 100);
  }

  private calculateThroughputScore(): number {
    const throughputMetrics = this.getThroughputMetrics();
    // Higher throughput = better score (simplified)
    return Math.min(100, throughputMetrics.messagesPerSecond * 10);
  }

  private calculateMemoryScore(): number {
    const memoryMetrics = this.getMemoryMetrics();
    const threshold = this.config.alertThresholds.memoryUsage;
    
    return Math.max(0, 100 - (memoryMetrics.heapUtilization / threshold) * 100);
  }

  /**
   * Record a snapshot of current metrics
   */
  public recordSnapshot(): void {
    const currentMetrics = this.getCurrentMetrics();
    const throughputMetrics = this.getThroughputMetrics();
    const memoryMetrics = this.getMemoryMetrics();
    
    const avgResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
      : 0;
    
    const errorRate = this.totalRequests > 0 ? this.errorCount / this.totalRequests : 0;

    const snapshot: MetricSnapshot = {
      timestamp: new Date(),
      connections: currentMetrics.activeConnections,
      responseTime: avgResponseTime,
      throughput: throughputMetrics.messagesPerSecond,
      errorRate,
      memoryUsage: memoryMetrics.heapUtilization
    };

    this.historicalSnapshots.push(snapshot);

    // Clean up old snapshots beyond retention period
    const cutoffTime = Date.now() - this.config.retentionPeriod;
    this.historicalSnapshots = this.historicalSnapshots.filter(s => 
      s.timestamp.getTime() > cutoffTime
    );
  }

  /**
   * Get historical data
   */
  public getHistoricalData(periodMs: number): HistoricalData {
    const cutoffTime = Date.now() - periodMs;
    const snapshots = this.historicalSnapshots.filter(s => 
      s.timestamp.getTime() > cutoffTime
    );

    return {
      snapshots,
      trends: this.calculateTrends(snapshots)
    };
  }

  /**
   * Calculate trends from historical data
   */
  private calculateTrends(snapshots: MetricSnapshot[]): HistoricalData['trends'] {
    if (snapshots.length < 2) {
      return {
        responseTime: 'stable',
        throughput: 'stable',
        errorRate: 'stable'
      };
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];

    return {
      responseTime: this.getTrend(first.responseTime, last.responseTime),
      throughput: this.getTrend(first.throughput, last.throughput, true), // Higher is better
      errorRate: this.getTrend(first.errorRate, last.errorRate)
    };
  }

  private getTrend(startValue: number, endValue: number, higherIsBetter = false): 'increasing' | 'decreasing' | 'stable' {
    const threshold = 0.1; // 10% change threshold
    const change = (endValue - startValue) / startValue;

    if (Math.abs(change) < threshold) {
      return 'stable';
    }

    if (higherIsBetter) {
      return change > 0 ? 'increasing' : 'decreasing';
    } else {
      return change > 0 ? 'increasing' : 'decreasing';
    }
  }

  /**
   * Clean up old data beyond retention period
   */
  public cleanupOldData(): void {
    const cutoffTime = Date.now() - this.config.retentionPeriod;
    
    this.historicalSnapshots = this.historicalSnapshots.filter(s => 
      s.timestamp.getTime() > cutoffTime
    );

    logger.debug('Old metrics data cleaned up', {
      component: 'PerformanceMetrics',
      remainingSnapshots: this.historicalSnapshots.length
    });
  }

  /**
   * Start metrics collection interval
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.recordSnapshot();
      this.cleanupOldData();
    }, this.config.metricsInterval);
  }

  /**
   * Destroy the metrics collector
   */
  public destroy(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    // Clear all data
    this.connectionEvents = [];
    this.messageEvents = [];
    this.responseTimes = [];
    this.memorySnapshots = [];
    this.historicalSnapshots = [];
    this.alertCallbacks = [];

    logger.info('Performance metrics destroyed', {
      component: 'PerformanceMetrics'
    });
  }
}