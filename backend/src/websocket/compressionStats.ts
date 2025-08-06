/**
 * WebSocket Compression Statistics
 * Advanced statistics tracking and analysis for compression performance
 */

import { logger } from '../utils/logger';

export interface CompressionStatsConfig {
  trackingWindow?: number;
  metricsInterval?: number;
  retentionPeriod?: number;
}

export interface CompressionRecord {
  timestamp: Date;
  originalSize: number;
  compressedSize: number;
  algorithm: string;
  compressionTime: number;
  ratio: number;
}

export interface CurrentStats {
  totalCompressions: number;
  averageCompressionRatio: number;
  totalBytesSaved: number;
  averageCompressionTime: number;
}

export interface BandwidthStats {
  totalOriginalBytes: number;
  totalCompressedBytes: number;
  totalBytesSaved: number;
  bandwidthReduction: number;
}

export interface AlgorithmEfficiency {
  [algorithm: string]: {
    averageRatio: number;
    averageTime: number;
    compressionCount: number;
  };
}

export interface PerformanceTrends {
  compressionTime: {
    trend: 'increasing' | 'decreasing' | 'stable';
    slope: number;
  };
  compressionRatio: {
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  recommendation: string;
}

export interface OptimalSettings {
  algorithm: string;
  compressionLevel: number;
  efficiency: number;
  reasoning: string;
}

export interface RealTimeStats {
  currentCompressionRate: number;
  bytesPerSecond: number;
  avgCompressionRatio: number;
  lastUpdated: Date;
}

export interface WindowStats {
  compressions: number;
  averageRatio: number;
  compressionRate: number;
  timeWindow: number;
}

export interface CompressionAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: Date;
  value?: number;
  threshold?: number;
}

export interface HistoricalSnapshot {
  timestamp: Date;
  compressionRatio: number;
  compressionTime: number;
  throughput: number;
}

export interface HistoricalData {
  snapshots: HistoricalSnapshot[];
  trends: {
    compressionRatio: 'increasing' | 'decreasing' | 'stable';
    compressionTime: 'increasing' | 'decreasing' | 'stable';
  };
}

export class CompressionStats {
  private config: Required<CompressionStatsConfig>;
  private compressionRecords: CompressionRecord[] = [];
  private metricsInterval: NodeJS.Timeout | null = null;
  private historicalSnapshots: HistoricalSnapshot[] = [];
  private alertCallbacks: Array<(alert: CompressionAlert) => void> = [];
  
  // Real-time tracking
  private recentCompressions: CompressionRecord[] = [];
  private lastStatsUpdate: number = Date.now(); // Used for tracking stats update timing

  constructor(config: CompressionStatsConfig = {}) {
    this.config = {
      trackingWindow: config.trackingWindow ?? 60000, // 1 minute
      metricsInterval: config.metricsInterval ?? 1000, // 1 second
      retentionPeriod: config.retentionPeriod ?? 300000 // 5 minutes
    };

    this.startMetricsCollection();

    logger.info('Compression statistics initialized', {
      component: 'CompressionStats',
      config: this.config
    });
  }

  /**
   * Record a compression operation
   */
  public recordCompression(originalSize: number, compressedSize: number, algorithm: string, compressionTime: number): void {
    const record: CompressionRecord = {
      timestamp: new Date(),
      originalSize,
      compressedSize,
      algorithm,
      compressionTime,
      ratio: compressedSize / originalSize
    };

    this.compressionRecords.push(record);
    this.recentCompressions.push(record);

    // Clean up old records
    const cutoffTime = Date.now() - this.config.retentionPeriod;
    this.compressionRecords = this.compressionRecords.filter(r => r.timestamp.getTime() > cutoffTime);

    // Clean up recent compressions (keep only tracking window)
    const recentCutoff = Date.now() - this.config.trackingWindow;
    this.recentCompressions = this.recentCompressions.filter(r => r.timestamp.getTime() > recentCutoff);

    // Check for anomalies
    this.checkCompressionAnomalies(record);
  }

  /**
   * Get current statistics
   */
  public getCurrentStats(): CurrentStats {
    if (this.compressionRecords.length === 0) {
      return {
        totalCompressions: 0,
        averageCompressionRatio: 0,
        totalBytesSaved: 0,
        averageCompressionTime: 0
      };
    }

    const totalCompressions = this.compressionRecords.length;
    const averageCompressionRatio = this.compressionRecords.reduce((sum, r) => sum + r.ratio, 0) / totalCompressions;
    const totalBytesSaved = this.compressionRecords.reduce((sum, r) => sum + (r.originalSize - r.compressedSize), 0);
    const averageCompressionTime = this.compressionRecords.reduce((sum, r) => sum + r.compressionTime, 0) / totalCompressions;

    return {
      totalCompressions,
      averageCompressionRatio,
      totalBytesSaved,
      averageCompressionTime
    };
  }

  /**
   * Get bandwidth statistics
   */
  public getBandwidthStats(): BandwidthStats {
    const totalOriginalBytes = this.compressionRecords.reduce((sum, r) => sum + r.originalSize, 0);
    const totalCompressedBytes = this.compressionRecords.reduce((sum, r) => sum + r.compressedSize, 0);
    const totalBytesSaved = totalOriginalBytes - totalCompressedBytes;
    const bandwidthReduction = totalOriginalBytes > 0 ? totalBytesSaved / totalOriginalBytes : 0;

    return {
      totalOriginalBytes,
      totalCompressedBytes,
      totalBytesSaved,
      bandwidthReduction
    };
  }

  /**
   * Get algorithm efficiency comparison
   */
  public getAlgorithmEfficiency(): AlgorithmEfficiency {
    const efficiency: AlgorithmEfficiency = {};

    this.compressionRecords.forEach(record => {
      if (!efficiency[record.algorithm]) {
        efficiency[record.algorithm] = {
          averageRatio: 0,
          averageTime: 0,
          compressionCount: 0
        };
      }

      const algo = efficiency[record.algorithm];
      algo.averageRatio = (algo.averageRatio * algo.compressionCount + record.ratio) / (algo.compressionCount + 1);
      algo.averageTime = (algo.averageTime * algo.compressionCount + record.compressionTime) / (algo.compressionCount + 1);
      algo.compressionCount++;
    });

    return efficiency;
  }

  /**
   * Analyze performance trends
   */
  public getPerformanceTrends(): PerformanceTrends {
    if (this.compressionRecords.length < 5) {
      return {
        compressionTime: { trend: 'stable', slope: 0 },
        compressionRatio: { trend: 'stable' },
        recommendation: 'Not enough data for trend analysis'
      };
    }

    const recentRecords = this.compressionRecords.slice(-10);
    const compressionTimes = recentRecords.map(r => r.compressionTime);
    
    // Calculate trend slope for compression time
    const n = compressionTimes.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = compressionTimes.reduce((sum, time) => sum + time, 0);
    const sumXY = compressionTimes.reduce((sum, time, index) => sum + index * time, 0);
    const sumXSquared = (n * (n - 1) * (2 * n - 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXSquared - sumX * sumX);
    
    let timeTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (Math.abs(slope) > 5) { // 5ms threshold
      timeTrend = slope > 0 ? 'increasing' : 'decreasing';
    }

    // Analyze ratio trend (simplified)
    const ratios = recentRecords.map(r => r.ratio);
    const avgRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
    let ratioTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    
    if (avgRatio > 0.7) {
      ratioTrend = 'increasing'; // Poor compression
    } else if (avgRatio < 0.5) {
      ratioTrend = 'decreasing'; // Good compression
    }

    // Generate recommendation
    let recommendation = 'Compression performance is stable';
    if (timeTrend === 'increasing') {
      recommendation = 'Warning: compression performance is degrading, consider optimizing settings';
    } else if (ratioTrend === 'increasing') {
      recommendation = 'Poor compression ratios detected, consider adjusting algorithms or thresholds';
    }

    return {
      compressionTime: { trend: timeTrend, slope },
      compressionRatio: { trend: ratioTrend },
      recommendation
    };
  }

  /**
   * Find optimal compression settings
   */
  public getOptimalSettings(): OptimalSettings {
    const efficiency = this.getAlgorithmEfficiency();
    let bestAlgorithm = 'deflate';
    let bestEfficiency = 0;

    Object.entries(efficiency).forEach(([algorithm, stats]) => {
      // Calculate efficiency score (lower ratio is better, lower time is better)
      const efficiencyScore = (1 - stats.averageRatio) * 0.7 + (1 - stats.averageTime / 1000) * 0.3;
      
      if (efficiencyScore > bestEfficiency) {
        bestEfficiency = efficiencyScore;
        bestAlgorithm = algorithm;
      }
    });

    // Determine optimal compression level based on performance
    const avgCompressionTime = this.getCurrentStats().averageCompressionTime;
    let optimalLevel = 6; // Default
    
    if (avgCompressionTime > 200) {
      optimalLevel = 3; // Faster compression
    } else if (avgCompressionTime < 50) {
      optimalLevel = 9; // Better compression
    }

    return {
      algorithm: bestAlgorithm,
      compressionLevel: optimalLevel,
      efficiency: bestEfficiency,
      reasoning: `Based on ${this.compressionRecords.length} compression operations, ${bestAlgorithm} provides the best efficiency`
    };
  }

  /**
   * Get performance recommendations
   */
  public getRecommendations(): string[] {
    const recommendations: string[] = [];
    const currentStats = this.getCurrentStats();
    const trends = this.getPerformanceTrends();

    if (currentStats.averageCompressionRatio > 0.8) {
      recommendations.push('Average compression ratio is low (>80%), consider increasing threshold or changing algorithm');
    }

    if (currentStats.averageCompressionTime > 200) {
      recommendations.push('Average compression time is high (>200ms), consider reducing compression level');
    }

    if (trends.compressionTime.trend === 'increasing') {
      recommendations.push('Compression times are increasing, monitor system load and consider optimization');
    }

    if (this.compressionRecords.length < 10) {
      recommendations.push('Insufficient data for accurate analysis, collect more compression samples');
    }

    return recommendations;
  }

  /**
   * Get real-time statistics
   */
  public getRealTimeStats(): RealTimeStats {
    // const now = Date.now();
    // const timeSinceUpdate = now - this.lastStatsUpdate; // Available for future use
    const recentCount = this.recentCompressions.length;
    // const timeSinceUpdate = Date.now() - this.lastStatsUpdate; // Available for future use

    const currentCompressionRate = recentCount / (this.config.trackingWindow / 1000);
    const bytesPerSecond = this.recentCompressions.reduce((sum, r) => sum + r.originalSize, 0) / (this.config.trackingWindow / 1000);
    const avgCompressionRatio = recentCount > 0 
      ? this.recentCompressions.reduce((sum, r) => sum + r.ratio, 0) / recentCount
      : 0;

    this.lastStatsUpdate = Date.now();
    
    return {
      currentCompressionRate,
      bytesPerSecond,
      avgCompressionRatio,
      lastUpdated: new Date()
    };
  }

  /**
   * Get statistics for a specific time window
   */
  public getWindowStats(windowMs: number): WindowStats {
    const cutoffTime = Date.now() - windowMs;
    const windowRecords = this.compressionRecords.filter(r => r.timestamp.getTime() > cutoffTime);

    const compressions = windowRecords.length;
    const averageRatio = compressions > 0 
      ? windowRecords.reduce((sum, r) => sum + r.ratio, 0) / compressions
      : 0;
    const compressionRate = compressions / (windowMs / 1000);

    return {
      compressions,
      averageRatio,
      compressionRate,
      timeWindow: windowMs
    };
  }

  /**
   * Register alert callback
   */
  public onAlert(callback: (alert: CompressionAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Check for compression anomalies
   */
  private checkCompressionAnomalies(record: CompressionRecord): void {
    // Check for poor compression ratio
    if (record.ratio > 0.9) {
      this.triggerAlert({
        type: 'poor_compression_ratio',
        severity: 'warning',
        message: `Poor compression ratio detected: ${(record.ratio * 100).toFixed(1)}%`,
        timestamp: new Date(),
        value: record.ratio,
        threshold: 0.9
      });
    }

    // Check for high compression time
    if (record.compressionTime > 500) {
      this.triggerAlert({
        type: 'high_compression_time',
        severity: 'warning',
        message: `High compression time detected: ${record.compressionTime}ms`,
        timestamp: new Date(),
        value: record.compressionTime,
        threshold: 500
      });
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(alert: CompressionAlert): void {
    logger.warn('Compression alert triggered', {
      component: 'CompressionStats',
      alert
    });

    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        logger.error('Error in compression alert callback', {
          component: 'CompressionStats',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  /**
   * Get historical data
   */
  public getHistoricalData(periodMs: number): HistoricalData {
    const cutoffTime = Date.now() - periodMs;
    const snapshots = this.historicalSnapshots.filter(s => s.timestamp.getTime() > cutoffTime);

    return {
      snapshots,
      trends: this.calculateHistoricalTrends(snapshots)
    };
  }

  /**
   * Calculate trends from historical snapshots
   */
  private calculateHistoricalTrends(snapshots: HistoricalSnapshot[]): HistoricalData['trends'] {
    if (snapshots.length < 2) {
      return {
        compressionRatio: 'stable',
        compressionTime: 'stable'
      };
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];

    return {
      compressionRatio: this.getTrend(first.compressionRatio, last.compressionRatio),
      compressionTime: this.getTrend(first.compressionTime, last.compressionTime)
    };
  }

  /**
   * Calculate trend direction
   */
  private getTrend(startValue: number, endValue: number): 'increasing' | 'decreasing' | 'stable' {
    const threshold = 0.1; // 10% change threshold
    const change = (endValue - startValue) / startValue;

    if (Math.abs(change) < threshold) {
      return 'stable';
    }

    return change > 0 ? 'increasing' : 'decreasing';
  }

  /**
   * Record a historical snapshot
   */
  private recordHistoricalSnapshot(): void {
    const currentStats = this.getCurrentStats();
    const realTimeStats = this.getRealTimeStats();

    const snapshot: HistoricalSnapshot = {
      timestamp: new Date(),
      compressionRatio: currentStats.averageCompressionRatio,
      compressionTime: currentStats.averageCompressionTime,
      throughput: realTimeStats.bytesPerSecond
    };

    this.historicalSnapshots.push(snapshot);

    // Clean up old snapshots
    const cutoffTime = Date.now() - this.config.retentionPeriod;
    this.historicalSnapshots = this.historicalSnapshots.filter(s => s.timestamp.getTime() > cutoffTime);
  }

  /**
   * Clean up old data
   */
  public cleanupOldData(): void {
    const cutoffTime = Date.now() - this.config.retentionPeriod;
    
    this.compressionRecords = this.compressionRecords.filter(r => r.timestamp.getTime() > cutoffTime);
    this.historicalSnapshots = this.historicalSnapshots.filter(s => s.timestamp.getTime() > cutoffTime);

    logger.debug('Old compression data cleaned up', {
      component: 'CompressionStats',
      remainingRecords: this.compressionRecords.length,
      remainingSnapshots: this.historicalSnapshots.length
    });
  }

  /**
   * Start metrics collection interval
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.recordHistoricalSnapshot();
      this.cleanupOldData();
      this.lastStatsUpdate = Date.now();
    }, this.config.metricsInterval);
  }

  /**
   * Destroy the compression stats collector
   */
  /**
   * Get last stats update timestamp
   */
  public getLastStatsUpdate(): number {
    return this.lastStatsUpdate;
  }

  public destroy(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    // Clear all data
    this.compressionRecords = [];
    this.recentCompressions = [];
    this.historicalSnapshots = [];
    this.alertCallbacks = [];

    logger.info('Compression statistics destroyed', {
      component: 'CompressionStats'
    });
  }
}