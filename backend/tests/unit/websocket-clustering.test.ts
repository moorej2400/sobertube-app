/**
 * WebSocket Clustering Tests
 * Tests for horizontal scaling and clustering functionality
 */

import { WebSocketClusterManager } from '../../src/websocket/clusterManager';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('@socket.io/redis-adapter');
jest.mock('redis');
jest.mock('../../src/utils/logger');

describe('WebSocket Clustering', () => {
  let clusterManager: WebSocketClusterManager;
  let mockRedisClient: any;
  let mockDuplicatedClient: any;
  let mockRedisAdapter: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock duplicated Redis client
    mockDuplicatedClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isReady: true,
      on: jest.fn(),
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined)
    };
    
    // Mock Redis client
    mockRedisClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isReady: true,
      on: jest.fn(),
      publish: jest.fn().mockResolvedValue(1),
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      duplicate: jest.fn().mockReturnValue(mockDuplicatedClient),
      get: jest.fn().mockImplementation((key) => {
        if (key === 'connection:backup:socket-123') {
          return Promise.resolve(JSON.stringify({
            userId: 'user-123',
            rooms: ['room-1', 'room-2'],
            sessionData: { preferences: { theme: 'dark' } }
          }));
        }
        return Promise.resolve('{"test": "data"}');
      }),
      setEx: jest.fn().mockResolvedValue('OK')
    };
    
    // Mock Redis adapter
    mockRedisAdapter = {
      serverCount: jest.fn().mockReturnValue(1),
      close: jest.fn().mockResolvedValue(undefined)
    };
    
    (createClient as jest.Mock).mockReturnValue(mockRedisClient);
    (createAdapter as jest.Mock).mockReturnValue(mockRedisAdapter);
  });

  describe('ClusterManager Initialization', () => {
    test('should initialize cluster manager successfully', () => {
      expect(() => {
        clusterManager = new WebSocketClusterManager({
          redisUrl: 'redis://localhost:6379',
          serverId: 'server-1',
          serverPort: 3001
        });
      }).not.toThrow();
    });

    test('should fail with invalid Redis URL', () => {
      expect(() => {
        clusterManager = new WebSocketClusterManager({
          redisUrl: 'invalid-url',
          serverId: 'server-1',
          serverPort: 3001
        });
      }).toThrow('Invalid Redis URL');
    });

    test('should fail with missing server ID', () => {
      expect(() => {
        clusterManager = new WebSocketClusterManager({
          redisUrl: 'redis://localhost:6379',
          serverId: '',
          serverPort: 3001
        });
      }).toThrow('Server ID is required');
    });
  });

  describe('Redis Adapter Configuration', () => {
    beforeEach(() => {
      clusterManager = new WebSocketClusterManager({
        redisUrl: 'redis://localhost:6379',
        serverId: 'server-1',
        serverPort: 3001
      });
    });

    test('should configure Redis adapter for clustering', async () => {
      const mockIOServer = {
        adapter: jest.fn()
      };

      await clusterManager.setupRedisAdapter(mockIOServer as any);

      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379'
      });
      expect(createAdapter).toHaveBeenCalled();
      expect(mockIOServer.adapter).toHaveBeenCalledWith(mockRedisAdapter);
    });

    test('should handle Redis connection failures gracefully', async () => {
      // Create a new cluster manager with failing Redis client
      const failingClusterManager = new WebSocketClusterManager({
        redisUrl: 'redis://localhost:6379',
        serverId: 'server-fail',
        serverPort: 3002
      });
      
      // Mock the failing connect
      const failingMockClient = {
        ...mockRedisClient,
        connect: jest.fn().mockRejectedValue(new Error('Connection failed'))
      };
      
      const failingDuplicatedClient = {
        ...mockDuplicatedClient,
        connect: jest.fn().mockRejectedValue(new Error('Connection failed'))
      };
      
      failingMockClient.duplicate = jest.fn().mockReturnValue(failingDuplicatedClient);
      (createClient as jest.Mock).mockReturnValueOnce(failingMockClient);
      
      const mockIOServer = {
        adapter: jest.fn()
      };

      await expect(failingClusterManager.setupRedisAdapter(mockIOServer as any))
        .rejects.toThrow('Failed to setup Redis adapter');
      
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Redis adapter setup failed'),
        expect.any(Object)
      );
    });
  });

  describe('Server Discovery and Health Checks', () => {
    beforeEach(() => {
      clusterManager = new WebSocketClusterManager({
        redisUrl: 'redis://localhost:6379',
        serverId: 'server-1',
        serverPort: 3001
      });
    });

    test('should register server in cluster', async () => {
      await clusterManager.registerServer();

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'cluster:server:register',
        expect.stringContaining('"serverId":"server-1"')
      );
    });

    test('should send periodic heartbeat', async () => {
      jest.useFakeTimers();
      
      await clusterManager.startHeartbeat();
      
      // Fast-forward time to trigger heartbeat
      jest.advanceTimersByTime(30000);
      
      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'cluster:server:heartbeat',
        expect.stringContaining('"serverId":"server-1"')
      );

      jest.useRealTimers();
    });

    test('should detect failed servers', async () => {
      const failedServerCallback = jest.fn();
      clusterManager.onServerFailure(failedServerCallback);

      // Add a mock failed server with old timestamp
      const oldTimestamp = new Date(Date.now() - 120000); // 2 minutes ago
      clusterManager['servers'].set('failed-server', {
        serverId: 'failed-server',
        serverUrl: 'http://localhost:3002',
        currentLoad: 10,
        maxConnections: 1000,
        status: 'healthy',
        lastHeartbeat: oldTimestamp
      });

      // Simulate server failure detection
      await clusterManager.detectFailedServers();

      // Should be called for servers that haven't sent heartbeat
      expect(failedServerCallback).toHaveBeenCalledWith({
        serverId: 'failed-server',
        lastSeen: oldTimestamp,
        reason: 'heartbeat_timeout'
      });
    });
  });

  describe('Event Distribution', () => {
    beforeEach(() => {
      clusterManager = new WebSocketClusterManager({
        redisUrl: 'redis://localhost:6379',
        serverId: 'server-1',
        serverPort: 3001
      });
    });

    test('should distribute events across cluster', async () => {
      const eventData = {
        type: 'post:liked',
        userId: 'user-123',
        postId: 'post-456',
        data: { totalLikes: 5 }
      };

      await clusterManager.distributeEvent('broadcast', eventData);

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'cluster:event:broadcast',
        JSON.stringify(eventData)
      );
    });

    test('should handle targeted event distribution', async () => {
      const eventData = {
        type: 'notification:new',
        targetUserId: 'user-123',
        data: { message: 'You have a new like' }
      };

      await clusterManager.distributeEvent('user', eventData, 'user-123');

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'cluster:event:user:user-123',
        JSON.stringify(eventData)
      );
    });

    test('should batch distribute multiple events', async () => {
      const events = [
        { type: 'post:liked', userId: 'user-1' },
        { type: 'post:liked', userId: 'user-2' },
        { type: 'post:liked', userId: 'user-3' }
      ];

      await clusterManager.batchDistributeEvents('batch', events);

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'cluster:event:batch',
        JSON.stringify(events)
      );
    });
  });

  describe('Load Balancing', () => {
    beforeEach(() => {
      clusterManager = new WebSocketClusterManager({
        redisUrl: 'redis://localhost:6379',
        serverId: 'server-1',
        serverPort: 3001
      });
    });

    test('should provide server load metrics', async () => {
      const metrics = await clusterManager.getServerMetrics();

      expect(metrics).toEqual({
        serverId: 'server-1',
        connections: expect.any(Number),
        cpuUsage: expect.any(Number),
        memoryUsage: expect.any(Number),
        uptime: expect.any(Number),
        timestamp: expect.any(Date)
      });
    });

    test('should determine server health status', () => {
      const healthStatus = clusterManager.getHealthStatus();

      expect(healthStatus).toEqual({
        serverId: 'server-1',
        status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
        connections: expect.any(Number),
        cpuUsage: expect.any(Number),
        memoryUsage: expect.any(Number),
        lastHeartbeat: expect.any(Date)
      });
    });

    test('should recommend least loaded server for new connections', async () => {
      // Register the current server first
      await clusterManager.registerServer();
      
      // Add some healthy servers to the cluster
      clusterManager['servers'].set('server-2', {
        serverId: 'server-2',
        serverUrl: 'http://localhost:3002',
        currentLoad: 50,
        maxConnections: 1000,
        status: 'healthy',
        lastHeartbeat: new Date()
      });
      
      clusterManager['servers'].set('server-3', {
        serverId: 'server-3',
        serverUrl: 'http://localhost:3003',
        currentLoad: 20,
        maxConnections: 1000,
        status: 'healthy',
        lastHeartbeat: new Date()
      });

      const serverRecommendation = await clusterManager.getLeastLoadedServer();

      expect(serverRecommendation).toEqual({
        serverId: expect.any(String),
        serverUrl: expect.any(String),
        currentLoad: expect.any(Number),
        maxConnections: expect.any(Number)
      });
    });
  });

  describe('Failover and Redundancy', () => {
    beforeEach(() => {
      clusterManager = new WebSocketClusterManager({
        redisUrl: 'redis://localhost:6379',
        serverId: 'server-1',
        serverPort: 3001
      });
    });

    test('should handle server shutdown gracefully', async () => {
      // Setup the adapter properly
      await clusterManager.setupRedisAdapter({
        adapter: jest.fn()
      } as any);
      
      await clusterManager.gracefulShutdown();

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'cluster:server:shutdown',
        expect.stringContaining('"serverId":"server-1"')
      );
      
      expect(mockRedisClient.disconnect).toHaveBeenCalled();
      expect(mockRedisAdapter.close).toHaveBeenCalled();
    });

    test('should migrate connections during server failure', async () => {
      // Add healthy servers for migration
      clusterManager['servers'].set('healthy-server-1', {
        serverId: 'healthy-server-1',
        serverUrl: 'http://localhost:3002',
        currentLoad: 30,
        maxConnections: 1000,
        status: 'healthy',
        lastHeartbeat: new Date()
      });
      
      clusterManager['servers'].set('healthy-server-2', {
        serverId: 'healthy-server-2',
        serverUrl: 'http://localhost:3003',
        currentLoad: 40,
        maxConnections: 1000,
        status: 'healthy',
        lastHeartbeat: new Date()
      });

      const migrationPlan = await clusterManager.createConnectionMigrationPlan('failed-server-2');

      expect(migrationPlan).toEqual({
        failedServerId: 'failed-server-2',
        affectedConnections: expect.any(Array),
        targetServers: expect.any(Array),
        migrationStrategy: expect.stringMatching(/^(redistribute|takeover|hybrid)$/)
      });
    });

    test('should backup and restore connection state', async () => {
      const connectionState = {
        userId: 'user-123',
        rooms: ['room-1', 'room-2'],
        sessionData: { preferences: { theme: 'dark' } }
      };

      // Backup connection state
      await clusterManager.backupConnectionState('socket-123', connectionState);
      
      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'cluster:connection:backup',
        expect.stringContaining('"socketId":"socket-123"')
      );

      // Restore connection state
      const restoredState = await clusterManager.restoreConnectionState('socket-123');
      
      expect(restoredState).toEqual(connectionState);
    });
  });

  describe('Auto-scaling Integration', () => {
    beforeEach(() => {
      clusterManager = new WebSocketClusterManager({
        redisUrl: 'redis://localhost:6379',
        serverId: 'server-1',
        serverPort: 3001
      });
    });

    test('should provide scaling metrics for auto-scaler', async () => {
      const scalingMetrics = await clusterManager.getScalingMetrics();

      expect(scalingMetrics).toEqual({
        totalServers: expect.any(Number),
        totalConnections: expect.any(Number),
        averageLoad: expect.any(Number),
        peakLoad: expect.any(Number),
        recommendedAction: expect.stringMatching(/^(scale_up|scale_down|maintain)$/),
        confidence: expect.any(Number),
        timestamp: expect.any(Date)
      });
    });

    test('should handle scale-up events', async () => {
      const scaleUpCallback = jest.fn();
      clusterManager.onScaleUp(scaleUpCallback);

      await clusterManager.handleScaleUp({
        targetInstances: 3,
        currentInstances: 2,
        reason: 'high_load'
      });

      expect(scaleUpCallback).toHaveBeenCalledWith({
        targetInstances: 3,
        currentInstances: 2,
        reason: 'high_load'
      });
    });

    test('should handle scale-down events', async () => {
      const scaleDownCallback = jest.fn();
      clusterManager.onScaleDown(scaleDownCallback);

      await clusterManager.handleScaleDown({
        targetInstances: 1,
        currentInstances: 2,
        serverToRemove: 'server-2'
      });

      expect(scaleDownCallback).toHaveBeenCalledWith({
        targetInstances: 1,
        currentInstances: 2,
        serverToRemove: 'server-2'
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    beforeEach(() => {
      clusterManager = new WebSocketClusterManager({
        redisUrl: 'redis://localhost:6379',
        serverId: 'server-1',
        serverPort: 3001
      });
    });

    test('should recover from Redis connection loss', async () => {
      // Simulate connection loss
      mockRedisClient.isReady = false;
      
      const recoveryPromise = clusterManager.handleRedisConnectionLoss();
      
      // Simulate connection restoration
      setTimeout(() => {
        mockRedisClient.isReady = true;
        mockRedisClient.connect.mockResolvedValueOnce(undefined);
      }, 100);
      
      await expect(recoveryPromise).resolves.not.toThrow();
      
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis connection lost'),
        expect.any(Object)
      );
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Redis connection restored'),
        expect.any(Object)
      );
    });

    test('should handle partial cluster failures', async () => {
      const partialFailureHandler = jest.fn();
      clusterManager.onPartialFailure(partialFailureHandler);

      // Add healthy servers for migration planning
      clusterManager['servers'].set('healthy-server-1', {
        serverId: 'healthy-server-1',
        serverUrl: 'http://localhost:3004',
        currentLoad: 30,
        maxConnections: 1000,
        status: 'healthy',
        lastHeartbeat: new Date()
      });

      await clusterManager.handlePartialClusterFailure(['server-2', 'server-3']);

      expect(partialFailureHandler).toHaveBeenCalledWith({
        failedServers: ['server-2', 'server-3'],
        remainingServers: expect.any(Array),
        migrationPlan: expect.any(Object)
      });
    });

    test('should maintain service during network partitions', async () => {
      const networkPartitionHandler = jest.fn();
      clusterManager.onNetworkPartition(networkPartitionHandler);

      await clusterManager.handleNetworkPartition({
        partitionedServers: ['server-2', 'server-3'],
        leaderServer: 'server-1'
      });

      expect(networkPartitionHandler).toHaveBeenCalledWith({
        partitionedServers: ['server-2', 'server-3'],
        leaderServer: 'server-1',
        strategy: expect.stringMatching(/^(maintain_quorum|split_brain_prevention)$/)
      });
    });
  });

  afterEach(() => {
    if (clusterManager) {
      clusterManager.gracefulShutdown().catch(() => {
        // Ignore cleanup errors in tests
      });
    }
  });
});