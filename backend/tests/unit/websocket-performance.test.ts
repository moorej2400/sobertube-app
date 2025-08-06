/**
 * WebSocket Performance Optimization Unit Tests
 * Tests for connection pooling, load balancing, and advanced performance features
 */

import { ConnectionPool } from '../../src/websocket/connectionPool';
import { PerformanceMetrics } from '../../src/websocket/performanceMetrics';

describe('WebSocket Performance Optimization', () => {
  describe('Connection Pooling', () => {
    let connectionPool: ConnectionPool;

    beforeEach(() => {
      connectionPool = new ConnectionPool({
        maxConnections: 1000,
        maxConnectionsPerUser: 5,
        connectionTimeout: 30000,
        cleanupInterval: 60000,
        loadBalancing: true
      });
    });

    afterEach(() => {
      connectionPool.destroy();
    });

    describe('Pool Management', () => {
      it('should initialize connection pool with correct configuration', () => {
        expect(connectionPool.getMaxConnections()).toBe(1000);
        expect(connectionPool.getMaxConnectionsPerUser()).toBe(5);
        expect(connectionPool.isLoadBalancingEnabled()).toBe(true);
        expect(connectionPool.getActiveConnections()).toBe(0);
      });

      it('should track active connections count', () => {
        const socketId1 = 'socket-123';
        const socketId2 = 'socket-456';
        const userId = 'user-789';

        connectionPool.addConnection(socketId1, userId, 'testuser1');
        expect(connectionPool.getActiveConnections()).toBe(1);

        connectionPool.addConnection(socketId2, userId, 'testuser2');
        expect(connectionPool.getActiveConnections()).toBe(2);

        connectionPool.removeConnection(socketId1);
        expect(connectionPool.getActiveConnections()).toBe(1);
      });

      it('should enforce maximum connections limit', () => {
        const poolSmall = new ConnectionPool({
          maxConnections: 2,
          maxConnectionsPerUser: 5
        });

        expect(poolSmall.addConnection('socket-1', 'user-1', 'user1')).toBe(true);
        expect(poolSmall.addConnection('socket-2', 'user-2', 'user2')).toBe(true);
        expect(poolSmall.addConnection('socket-3', 'user-3', 'user3')).toBe(false);

        poolSmall.destroy();
      });

      it('should enforce per-user connection limits', () => {
        const poolLimited = new ConnectionPool({
          maxConnections: 1000,
          maxConnectionsPerUser: 2
        });

        const userId = 'user-123';
        
        expect(poolLimited.addConnection('socket-1', userId, 'testuser')).toBe(true);
        expect(poolLimited.addConnection('socket-2', userId, 'testuser')).toBe(true);
        expect(poolLimited.addConnection('socket-3', userId, 'testuser')).toBe(false);

        poolLimited.destroy();
      });
    });

    describe('Load Balancing', () => {
      it('should distribute connections evenly across workers', () => {
        const poolBalanced = new ConnectionPool({
          maxConnections: 1000,
          maxConnectionsPerUser: 10,
          loadBalancing: true,
          workerCount: 4
        });

        // Add multiple connections
        for (let i = 0; i < 8; i++) {
          poolBalanced.addConnection(`socket-${i}`, `user-${i}`, `user${i}`);
        }

        const workerDistribution = poolBalanced.getWorkerDistribution();
        expect(workerDistribution).toHaveLength(4);
        
        // Each worker should have roughly equal connections (2 each for 8 connections)
        workerDistribution.forEach(workerConnections => {
          expect(workerConnections).toBeGreaterThanOrEqual(1);
          expect(workerConnections).toBeLessThanOrEqual(3);
        });

        poolBalanced.destroy();
      });

      it('should reassign connections when workers become overloaded', () => {
        const poolRebalance = new ConnectionPool({
          maxConnections: 1000,
          maxConnectionsPerUser: 10,
          loadBalancing: true,
          workerCount: 2,
          rebalanceThreshold: 3
        });

        // Add connections to trigger rebalancing
        for (let i = 0; i < 6; i++) {
          poolRebalance.addConnection(`socket-${i}`, `user-${i}`, `user${i}`);
        }

        const workerDistribution = poolRebalance.getWorkerDistribution();
        const maxWorkerLoad = Math.max(...workerDistribution);
        const minWorkerLoad = Math.min(...workerDistribution);
        
        // After rebalancing, difference should be minimal
        expect(maxWorkerLoad - minWorkerLoad).toBeLessThanOrEqual(1);

        poolRebalance.destroy();
      });

      it('should select optimal worker for new connections', () => {
        const poolOptimal = new ConnectionPool({
          maxConnections: 1000,
          maxConnectionsPerUser: 10,
          loadBalancing: true,
          workerCount: 3
        });

        // Manually load one worker heavily
        for (let i = 0; i < 5; i++) {
          poolOptimal.addConnection(`socket-heavy-${i}`, `user-heavy-${i}`, `userHeavy${i}`);
        }

        // New connection should go to a less loaded worker
        const optimalWorker = poolOptimal.getOptimalWorker();
        expect(optimalWorker).not.toBe(0); // Assuming first worker is heavily loaded

        poolOptimal.destroy();
      });
    });

    describe('Connection Health Monitoring', () => {
      it('should track connection health metrics', () => {
        connectionPool.addConnection('socket-1', 'user-1', 'user1');
        connectionPool.addConnection('socket-2', 'user-2', 'user2');

        const healthMetrics = connectionPool.getHealthMetrics();
        
        expect(healthMetrics.totalConnections).toBe(2);
        expect(healthMetrics.averageResponseTime).toBeDefined();
        expect(healthMetrics.errorRate).toBeDefined();
        expect(healthMetrics.lastUpdated).toBeInstanceOf(Date);
      });

      it('should detect unhealthy connections', () => {
        connectionPool.addConnection('socket-healthy', 'user-1', 'user1');
        connectionPool.addConnection('socket-unhealthy', 'user-2', 'user2');

        // Simulate unhealthy connection
        connectionPool.markConnectionUnhealthy('socket-unhealthy', 'high_latency');

        const unhealthyConnections = connectionPool.getUnhealthyConnections();
        expect(unhealthyConnections).toHaveLength(1);
        expect(unhealthyConnections[0].socketId).toBe('socket-unhealthy');
        expect(unhealthyConnections[0].issue).toBe('high_latency');
      });

      it('should automatically remove timed out connections', async () => {
        const poolTimeout = new ConnectionPool({
          maxConnections: 1000,
          maxConnectionsPerUser: 5,
          connectionTimeout: 50 // 50ms timeout for testing
        });

        poolTimeout.addConnection('socket-timeout', 'user-1', 'user1');
        expect(poolTimeout.getActiveConnections()).toBe(1);

        // Wait for timeout
        await new Promise(resolve => setTimeout(resolve, 60));
        
        // Manually trigger cleanup
        poolTimeout.cleanupTimedOutConnections();

        expect(poolTimeout.getActiveConnections()).toBe(0);

        poolTimeout.destroy();
      });
    });

    describe('Resource Management', () => {
      it('should provide connection pool statistics', () => {
        connectionPool.addConnection('socket-1', 'user-1', 'user1');
        connectionPool.addConnection('socket-2', 'user-1', 'user1');
        connectionPool.addConnection('socket-3', 'user-2', 'user2');

        const stats = connectionPool.getPoolStatistics();
        
        expect(stats.totalConnections).toBe(3);
        expect(stats.uniqueUsers).toBe(2);
        expect(stats.averageConnectionsPerUser).toBe(1.5);
        expect(stats.poolUtilization).toBe(0.003); // 3/1000 = 0.003
        expect(stats.workerDistribution).toBeDefined();
      });

      it('should handle graceful shutdown', async () => {
        connectionPool.addConnection('socket-1', 'user-1', 'user1');
        connectionPool.addConnection('socket-2', 'user-2', 'user2');

        expect(connectionPool.getActiveConnections()).toBe(2);

        await connectionPool.gracefulShutdown(5000); // 5 second timeout

        expect(connectionPool.getActiveConnections()).toBe(0);
        expect(connectionPool.isShuttingDown()).toBe(true);
      });

      it('should reject new connections during shutdown', async () => {
        connectionPool.startShutdown();

        const result = connectionPool.addConnection('socket-new', 'user-new', 'userNew');
        expect(result).toBe(false);
      });
    });
  });

  describe('Performance Metrics', () => {
    let performanceMetrics: PerformanceMetrics;

    beforeEach(() => {
      performanceMetrics = new PerformanceMetrics({
        metricsInterval: 1000,
        retentionPeriod: 300000, // 5 minutes
        alertThresholds: {
          connectionCount: 900,
          memoryUsage: 0.8,
          responseTime: 1000,
          errorRate: 0.05
        }
      });
    });

    afterEach(() => {
      performanceMetrics.destroy();
    });

    describe('Metrics Collection', () => {
      it('should collect real-time connection metrics', () => {
        performanceMetrics.recordConnectionEvent('connect', { userId: 'user-1', socketId: 'socket-1' });
        performanceMetrics.recordConnectionEvent('disconnect', { userId: 'user-2', socketId: 'socket-2' });

        const metrics = performanceMetrics.getCurrentMetrics();
        
        expect(metrics.connectionsPerSecond).toBeDefined();
        expect(metrics.disconnectionsPerSecond).toBeDefined();
        expect(metrics.activeConnections).toBeDefined();
        expect(metrics.timestamp).toBeInstanceOf(Date);
      });

      it('should track message throughput', () => {
        performanceMetrics.recordMessageEvent('sent', { size: 1024, messageType: 'like' });
        performanceMetrics.recordMessageEvent('sent', { size: 512, messageType: 'comment' });
        performanceMetrics.recordMessageEvent('received', { size: 256, messageType: 'join_room' });

        const throughputMetrics = performanceMetrics.getThroughputMetrics();
        
        expect(throughputMetrics.messagesPerSecond).toBeDefined();
        expect(throughputMetrics.bytesPerSecond).toBeDefined();
        expect(throughputMetrics.averageMessageSize).toBeDefined();
        expect(throughputMetrics.messageTypes).toBeDefined();
      });

      it('should monitor memory usage patterns', () => {
        performanceMetrics.recordMemoryUsage({
          heapUsed: 50 * 1024 * 1024, // 50MB
          heapTotal: 100 * 1024 * 1024, // 100MB
          external: 10 * 1024 * 1024, // 10MB
          rss: 80 * 1024 * 1024 // 80MB
        });

        const memoryMetrics = performanceMetrics.getMemoryMetrics();
        
        expect(memoryMetrics.heapUtilization).toBe(0.5); // 50MB / 100MB
        expect(memoryMetrics.memoryGrowthRate).toBeDefined();
        expect(memoryMetrics.gcFrequency).toBeDefined();
      });
    });

    describe('Performance Alerts', () => {
      it('should trigger alerts when thresholds are exceeded', () => {
        const alertCallback = jest.fn();
        performanceMetrics.onAlert(alertCallback);

        // Trigger high connection count alert
        performanceMetrics.recordConnectionEvent('bulk_connect', { count: 950 });

        expect(alertCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'connection_count_high',
            severity: 'warning',
            value: 950,
            threshold: 900
          })
        );
      });

      it('should track performance degradation trends', () => {
        // Record increasing response times
        for (let i = 0; i < 10; i++) {
          performanceMetrics.recordResponseTime(100 + i * 50);
        }

        const degradationAlert = performanceMetrics.checkPerformanceTrends();
        
        expect(degradationAlert).toBeDefined();
        expect(degradationAlert).toBeDefined();
        expect(degradationAlert!.type).toBe('performance_degradation');
        expect(degradationAlert!.trend).toBe('increasing');
      });

      it('should calculate performance scores', () => {
        // Record various metrics
        performanceMetrics.recordResponseTime(200);
        performanceMetrics.recordError();
        performanceMetrics.recordThroughput(1000);
        performanceMetrics.recordMemoryUsage({
          heapUsed: 40 * 1024 * 1024,
          heapTotal: 100 * 1024 * 1024,
          external: 5 * 1024 * 1024,
          rss: 60 * 1024 * 1024
        });

        const performanceScore = performanceMetrics.calculatePerformanceScore();
        
        expect(performanceScore.overall).toBeGreaterThan(0);
        expect(performanceScore.overall).toBeLessThanOrEqual(100);
        expect(performanceScore.breakdown.responseTime).toBeDefined();
        expect(performanceScore.breakdown.errorRate).toBeDefined();
        expect(performanceScore.breakdown.throughput).toBeDefined();
        expect(performanceScore.breakdown.memoryUsage).toBeDefined();
      });
    });

    describe('Historical Data', () => {
      it('should maintain historical metrics for analysis', () => {
        // Record metrics over time
        for (let i = 0; i < 5; i++) {
          performanceMetrics.recordSnapshot();
          // Simulate time passage
          jest.advanceTimersByTime(1000);
        }

        const historicalData = performanceMetrics.getHistoricalData(5000); // Last 5 seconds
        
        expect(historicalData.snapshots).toHaveLength(5);
        expect(historicalData.trends.responseTime).toBeDefined();
        expect(historicalData.trends.throughput).toBeDefined();
        expect(historicalData.trends.errorRate).toBeDefined();
      });

      it('should clean up old historical data', async () => {
        jest.useFakeTimers();
        
        // Record old metrics
        performanceMetrics.recordSnapshot();
        expect(performanceMetrics.getHistoricalData(400000).snapshots).toHaveLength(1);
        
        // Fast forward past retention period
        jest.advanceTimersByTime(400000); // 6.6 minutes (past 5 minute retention)
        
        performanceMetrics.cleanupOldData();
        
        const historicalData = performanceMetrics.getHistoricalData(400000);
        expect(historicalData.snapshots).toHaveLength(0);
        
        jest.useRealTimers();
      });
    });
  });
});