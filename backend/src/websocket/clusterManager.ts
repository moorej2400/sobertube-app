/**
 * WebSocket Cluster Manager
 * Manages horizontal scaling, load balancing, and clustering for WebSocket servers
 */

import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';
import os from 'os';
import { EventEmitter } from 'events';

export interface ClusterConfig {
  redisUrl: string;
  serverId: string;
  serverPort: number;
  heartbeatInterval?: number;
  failureDetectionTimeout?: number;
  maxConnections?: number;
}

export interface ServerMetrics {
  serverId: string;
  connections: number;
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
  timestamp: Date;
}

export interface HealthStatus {
  serverId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  connections: number;
  cpuUsage: number;
  memoryUsage: number;
  lastHeartbeat: Date;
}

export interface ConnectionMigrationPlan {
  failedServerId: string;
  affectedConnections: string[];
  targetServers: string[];
  migrationStrategy: 'redistribute' | 'takeover' | 'hybrid';
}

export interface ScalingMetrics {
  totalServers: number;
  totalConnections: number;
  averageLoad: number;
  peakLoad: number;
  recommendedAction: 'scale_up' | 'scale_down' | 'maintain';
  confidence: number;
  timestamp: Date;
}

export interface ServerInfo {
  serverId: string;
  serverUrl: string;
  currentLoad: number;
  maxConnections: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastHeartbeat: Date;
}

export class WebSocketClusterManager extends EventEmitter {
  private config: ClusterConfig;
  private pubClient!: RedisClientType;
  private subClient!: RedisClientType;
  private adapter: any;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private servers: Map<string, ServerInfo> = new Map();
  private startTime: Date;
  
  // Performance monitoring
  private connectionCount: number = 0;
  private peakConnectionCount: number = 0;
  private lastCpuUsage: number = 0;
  private lastMemoryUsage: number = 0;

  constructor(config: ClusterConfig) {
    super();
    this.validateConfig(config);
    this.config = {
      heartbeatInterval: 30000, // 30 seconds
      failureDetectionTimeout: 90000, // 90 seconds
      maxConnections: 10000,
      ...config
    };
    this.startTime = new Date();
    
    this.setupRedisClients();
    
    logger.info('WebSocket Cluster Manager initialized', {
      component: 'ClusterManager',
      serverId: this.config.serverId,
      redisUrl: this.config.redisUrl,
      maxConnections: this.config.maxConnections
    });
  }

  /**
   * Validate cluster configuration
   */
  private validateConfig(config: ClusterConfig): void {
    if (!config.redisUrl || !this.isValidRedisUrl(config.redisUrl)) {
      throw new Error('Invalid Redis URL');
    }
    
    if (!config.serverId || config.serverId.trim() === '') {
      throw new Error('Server ID is required');
    }
    
    if (!config.serverPort || config.serverPort <= 0 || config.serverPort > 65535) {
      throw new Error('Valid server port is required');
    }
  }

  /**
   * Check if Redis URL is valid
   */
  private isValidRedisUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'redis:' || parsedUrl.protocol === 'rediss:';
    } catch {
      return false;
    }
  }

  /**
   * Setup Redis clients for pub/sub and adapter
   */
  private setupRedisClients(): void {
    try {
      // Create Redis clients for pub/sub
      this.pubClient = createClient({ url: this.config.redisUrl });
      this.subClient = this.pubClient.duplicate();
      
      // Setup error handlers
      this.pubClient.on('error', (error) => {
        logger.error('Redis pub client error', {
          component: 'ClusterManager',
          serverId: this.config.serverId,
          error: error.message
        });
        this.handleRedisConnectionLoss();
      });
      
      this.subClient.on('error', (error) => {
        logger.error('Redis sub client error', {
          component: 'ClusterManager',
          serverId: this.config.serverId,
          error: error.message
        });
        this.handleRedisConnectionLoss();
      });
      
    } catch (error) {
      logger.error('Failed to setup Redis clients', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Setup Redis adapter for Socket.IO clustering
   */
  public async setupRedisAdapter(ioServer: SocketIOServer): Promise<void> {
    try {
      // Connect Redis clients
      if (!this.pubClient.isReady) {
        await this.pubClient.connect();
      }
      if (!this.subClient.isReady) {
        await this.subClient.connect();
      }
      
      // Create and configure adapter
      this.adapter = createAdapter(this.pubClient, this.subClient);
      ioServer.adapter(this.adapter);
      
      // Setup cluster event subscriptions
      await this.setupClusterEventHandlers();
      
      logger.info('Redis adapter configured successfully', {
        component: 'ClusterManager',
        serverId: this.config.serverId
      });
      
    } catch (error) {
      logger.error('Redis adapter setup failed', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('Failed to setup Redis adapter');
    }
  }

  /**
   * Setup cluster event handlers
   */
  private async setupClusterEventHandlers(): Promise<void> {
    try {
      // Subscribe to cluster events
      await this.subClient.subscribe('cluster:server:register', this.handleServerRegister.bind(this));
      await this.subClient.subscribe('cluster:server:heartbeat', this.handleServerHeartbeat.bind(this));
      await this.subClient.subscribe('cluster:server:shutdown', this.handleServerShutdown.bind(this));
      await this.subClient.subscribe('cluster:event:broadcast', this.handleBroadcastEvent.bind(this));
      await this.subClient.subscribe(`cluster:event:user:*`, this.handleUserEvent.bind(this));
      await this.subClient.subscribe('cluster:event:batch', this.handleBatchEvents.bind(this));
      
      logger.info('Cluster event handlers configured', {
        component: 'ClusterManager',
        serverId: this.config.serverId
      });
      
    } catch (error) {
      logger.error('Failed to setup cluster event handlers', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Register this server in the cluster
   */
  public async registerServer(): Promise<void> {
    try {
      const serverInfo = {
        serverId: this.config.serverId,
        serverUrl: `http://localhost:${this.config.serverPort}`,
        maxConnections: this.config.maxConnections,
        status: 'healthy' as const,
        registeredAt: new Date(),
        capabilities: ['websocket', 'realtime', 'clustering']
      };
      
      await this.pubClient.publish('cluster:server:register', JSON.stringify(serverInfo));
      
      // Add to local servers map
      this.servers.set(this.config.serverId, {
        serverId: this.config.serverId,
        serverUrl: `http://localhost:${this.config.serverPort}`,
        currentLoad: 0,
        maxConnections: this.config.maxConnections!,
        status: 'healthy',
        lastHeartbeat: new Date()
      });
      
      logger.info('Server registered in cluster', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        serverInfo
      });
      
    } catch (error) {
      logger.error('Failed to register server in cluster', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Start heartbeat mechanism
   */
  public async startHeartbeat(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(async () => {
      try {
        const heartbeatData = {
          serverId: this.config.serverId,
          timestamp: new Date(),
          connections: this.connectionCount,
          cpuUsage: this.getCurrentCpuUsage(),
          memoryUsage: this.getCurrentMemoryUsage(),
          uptime: Date.now() - this.startTime.getTime()
        };
        
        await this.pubClient.publish('cluster:server:heartbeat', JSON.stringify(heartbeatData));
        
        // Update local server info
        const serverInfo = this.servers.get(this.config.serverId);
        if (serverInfo) {
          serverInfo.currentLoad = this.connectionCount;
          serverInfo.lastHeartbeat = new Date();
          serverInfo.status = this.determineHealthStatus();
        }
        
      } catch (error) {
        logger.error('Heartbeat failed', {
          component: 'ClusterManager',
          serverId: this.config.serverId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.config.heartbeatInterval);
    
    logger.info('Heartbeat mechanism started', {
      component: 'ClusterManager',
      serverId: this.config.serverId,
      interval: this.config.heartbeatInterval
    });
  }

  /**
   * Handle server registration events
   */
  private handleServerRegister(message: string): void {
    try {
      const serverInfo = JSON.parse(message);
      
      if (serverInfo.serverId !== this.config.serverId) {
        this.servers.set(serverInfo.serverId, {
          serverId: serverInfo.serverId,
          serverUrl: serverInfo.serverUrl,
          currentLoad: 0,
          maxConnections: serverInfo.maxConnections,
          status: 'healthy',
          lastHeartbeat: new Date()
        });
        
        logger.info('New server registered in cluster', {
          component: 'ClusterManager',
          serverId: this.config.serverId,
          newServerId: serverInfo.serverId,
          totalServers: this.servers.size
        });
        
        this.emit('server:registered', serverInfo);
      }
      
    } catch (error) {
      logger.error('Failed to handle server registration', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle server heartbeat events
   */
  private handleServerHeartbeat(message: string): void {
    try {
      const heartbeatData = JSON.parse(message);
      
      if (heartbeatData.serverId !== this.config.serverId) {
        const serverInfo = this.servers.get(heartbeatData.serverId);
        if (serverInfo) {
          serverInfo.currentLoad = heartbeatData.connections;
          serverInfo.lastHeartbeat = new Date(heartbeatData.timestamp);
          serverInfo.status = this.determineServerHealthFromMetrics(heartbeatData);
        }
      }
      
    } catch (error) {
      logger.error('Failed to handle server heartbeat', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle server shutdown events
   */
  private handleServerShutdown(message: string): void {
    try {
      const shutdownData = JSON.parse(message);
      
      if (shutdownData.serverId !== this.config.serverId) {
        this.servers.delete(shutdownData.serverId);
        
        logger.info('Server removed from cluster', {
          component: 'ClusterManager',
          serverId: this.config.serverId,
          removedServerId: shutdownData.serverId,
          totalServers: this.servers.size
        });
        
        this.emit('server:shutdown', shutdownData);
      }
      
    } catch (error) {
      logger.error('Failed to handle server shutdown', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle broadcast events
   */
  private handleBroadcastEvent(message: string): void {
    try {
      const eventData = JSON.parse(message);
      this.emit('cluster:broadcast', eventData);
      
    } catch (error) {
      logger.error('Failed to handle broadcast event', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle user-specific events
   */
  private handleUserEvent(message: string): void {
    try {
      const eventData = JSON.parse(message);
      this.emit('cluster:user_event', eventData);
      
    } catch (error) {
      logger.error('Failed to handle user event', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle batch events
   */
  private handleBatchEvents(message: string): void {
    try {
      const events = JSON.parse(message);
      this.emit('cluster:batch_events', events);
      
    } catch (error) {
      logger.error('Failed to handle batch events', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Distribute event across cluster
   */
  public async distributeEvent(type: 'broadcast' | 'user', eventData: any, targetUserId?: string): Promise<void> {
    try {
      if (type === 'broadcast') {
        await this.pubClient.publish('cluster:event:broadcast', JSON.stringify(eventData));
      } else if (type === 'user' && targetUserId) {
        await this.pubClient.publish(`cluster:event:user:${targetUserId}`, JSON.stringify(eventData));
      } else {
        throw new Error('Invalid event distribution type or missing target user');
      }
      
    } catch (error) {
      logger.error('Failed to distribute event', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        type,
        targetUserId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Batch distribute multiple events
   */
  public async batchDistributeEvents(type: 'broadcast' | 'batch', events: any[]): Promise<void> {
    try {
      if (type === 'broadcast') {
        for (const event of events) {
          await this.pubClient.publish('cluster:event:broadcast', JSON.stringify(event));
        }
      } else {
        await this.pubClient.publish('cluster:event:batch', JSON.stringify(events));
      }
      
    } catch (error) {
      logger.error('Failed to batch distribute events', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        type,
        eventCount: events.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get current server metrics
   */
  public async getServerMetrics(): Promise<ServerMetrics> {
    return {
      serverId: this.config.serverId,
      connections: this.connectionCount,
      cpuUsage: this.getCurrentCpuUsage(),
      memoryUsage: this.getCurrentMemoryUsage(),
      uptime: Date.now() - this.startTime.getTime(),
      timestamp: new Date()
    };
  }

  /**
   * Get server health status
   */
  public getHealthStatus(): HealthStatus {
    const cpuUsage = this.getCurrentCpuUsage();
    const memoryUsage = this.getCurrentMemoryUsage();
    
    return {
      serverId: this.config.serverId,
      status: this.determineHealthStatus(),
      connections: this.connectionCount,
      cpuUsage,
      memoryUsage,
      lastHeartbeat: new Date()
    };
  }

  /**
   * Get least loaded server for load balancing
   */
  public async getLeastLoadedServer(): Promise<ServerInfo> {
    let leastLoadedServer = this.servers.get(this.config.serverId);
    let minLoad = this.connectionCount / this.config.maxConnections!;
    
    for (const [_serverId, serverInfo] of this.servers) {
      if (serverInfo.status === 'healthy') {
        const serverLoad = serverInfo.currentLoad / serverInfo.maxConnections;
        if (serverLoad < minLoad) {
          minLoad = serverLoad;
          leastLoadedServer = serverInfo;
        }
      }
    }
    
    if (!leastLoadedServer) {
      throw new Error('No healthy servers available');
    }
    
    return leastLoadedServer;
  }

  /**
   * Detect failed servers
   */
  public async detectFailedServers(): Promise<void> {
    const now = Date.now();
    const failureTimeout = this.config.failureDetectionTimeout!;
    
    for (const [serverId, serverInfo] of this.servers) {
      if (serverId !== this.config.serverId) {
        const timeSinceLastHeartbeat = now - serverInfo.lastHeartbeat.getTime();
        
        if (timeSinceLastHeartbeat > failureTimeout) {
          logger.warn('Server failure detected', {
            component: 'ClusterManager',
            serverId: this.config.serverId,
            failedServerId: serverId,
            timeSinceLastHeartbeat
          });
          
          this.emit('server:failure', {
            serverId,
            lastSeen: serverInfo.lastHeartbeat,
            reason: 'heartbeat_timeout'
          });
          
          // Remove failed server
          this.servers.delete(serverId);
        }
      }
    }
  }

  /**
   * Create connection migration plan
   */
  public async createConnectionMigrationPlan(failedServerId: string): Promise<ConnectionMigrationPlan> {
    const healthyServers = Array.from(this.servers.values())
      .filter(server => server.status === 'healthy' && server.serverId !== failedServerId);
    
    if (healthyServers.length === 0) {
      throw new Error('No healthy servers available for migration');
    }
    
    // Determine migration strategy based on available resources
    const totalCapacity = healthyServers.reduce((sum, server) => sum + server.maxConnections, 0);
    const currentLoad = healthyServers.reduce((sum, server) => sum + server.currentLoad, 0);
    const availableCapacity = totalCapacity - currentLoad;
    
    let migrationStrategy: 'redistribute' | 'takeover' | 'hybrid' = 'redistribute';
    
    if (availableCapacity < 100) { // Low available capacity
      migrationStrategy = 'takeover';
    } else if (healthyServers.length === 1) {
      migrationStrategy = 'takeover';
    } else {
      migrationStrategy = 'hybrid';
    }
    
    return {
      failedServerId,
      affectedConnections: [], // Would be populated with actual connection IDs
      targetServers: healthyServers.map(server => server.serverId),
      migrationStrategy
    };
  }

  /**
   * Backup connection state
   */
  public async backupConnectionState(socketId: string, connectionState: any): Promise<void> {
    try {
      const backupData = {
        socketId,
        serverId: this.config.serverId,
        connectionState,
        timestamp: new Date()
      };
      
      await this.pubClient.publish('cluster:connection:backup', JSON.stringify(backupData));
      
      // Also store in Redis with expiration
      await this.pubClient.setEx(`connection:backup:${socketId}`, 3600, JSON.stringify(connectionState));
      
    } catch (error) {
      logger.error('Failed to backup connection state', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        socketId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Restore connection state
   */
  public async restoreConnectionState(socketId: string): Promise<any> {
    try {
      const backupData = await this.pubClient.get(`connection:backup:${socketId}`);
      
      if (backupData) {
        return JSON.parse(backupData);
      }
      
      return null;
      
    } catch (error) {
      logger.error('Failed to restore connection state', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        socketId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get scaling metrics for auto-scaler
   */
  public async getScalingMetrics(): Promise<ScalingMetrics> {
    const servers = Array.from(this.servers.values());
    const totalConnections = servers.reduce((sum, server) => sum + server.currentLoad, 0);
    const totalCapacity = servers.reduce((sum, server) => sum + server.maxConnections, 0);
    const averageLoad = totalConnections / totalCapacity;
    
    let recommendedAction: 'scale_up' | 'scale_down' | 'maintain' = 'maintain';
    let confidence = 0.8;
    
    if (averageLoad > 0.8) {
      recommendedAction = 'scale_up';
      confidence = 0.9;
    } else if (averageLoad < 0.3 && servers.length > 1) {
      recommendedAction = 'scale_down';
      confidence = 0.7;
    }
    
    return {
      totalServers: servers.length,
      totalConnections,
      averageLoad,
      peakLoad: this.peakConnectionCount / this.config.maxConnections!,
      recommendedAction,
      confidence,
      timestamp: new Date()
    };
  }

  /**
   * Handle scale-up events
   */
  public async handleScaleUp(scaleUpParams: any): Promise<void> {
    logger.info('Handling scale-up event', {
      component: 'ClusterManager',
      serverId: this.config.serverId,
      scaleUpParams
    });
    
    this.emit('scale:up', scaleUpParams);
  }

  /**
   * Handle scale-down events
   */
  public async handleScaleDown(scaleDownParams: any): Promise<void> {
    logger.info('Handling scale-down event', {
      component: 'ClusterManager',
      serverId: this.config.serverId,
      scaleDownParams
    });
    
    this.emit('scale:down', scaleDownParams);
  }

  /**
   * Handle Redis connection loss
   */
  public async handleRedisConnectionLoss(): Promise<void> {
    logger.warn('Redis connection lost, attempting recovery', {
      component: 'ClusterManager',
      serverId: this.config.serverId
    });
    
    try {
      // Attempt to reconnect
      if (!this.pubClient.isReady) {
        await this.pubClient.connect();
      }
      if (!this.subClient.isReady) {
        await this.subClient.connect();
      }
      
      // Re-setup event handlers
      await this.setupClusterEventHandlers();
      
      logger.info('Redis connection restored', {
        component: 'ClusterManager',
        serverId: this.config.serverId
      });
      
    } catch (error) {
      logger.error('Failed to restore Redis connection', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      setTimeout(() => this.handleRedisConnectionLoss(), 5000); // Retry in 5 seconds
    }
  }

  /**
   * Handle partial cluster failures
   */
  public async handlePartialClusterFailure(failedServers: string[]): Promise<void> {
    const remainingServers = Array.from(this.servers.keys())
      .filter(serverId => !failedServers.includes(serverId));
    
    const migrationPlan = await Promise.all(
      failedServers.map(serverId => this.createConnectionMigrationPlan(serverId))
    );
    
    logger.warn('Handling partial cluster failure', {
      component: 'ClusterManager',
      serverId: this.config.serverId,
      failedServers,
      remainingServers: remainingServers.length,
      migrationPlans: migrationPlan.length
    });
    
    this.emit('cluster:partial_failure', {
      failedServers,
      remainingServers,
      migrationPlan
    });
  }

  /**
   * Handle network partitions
   */
  public async handleNetworkPartition(partitionData: any): Promise<void> {
    logger.warn('Handling network partition', {
      component: 'ClusterManager',
      serverId: this.config.serverId,
      partitionData
    });
    
    const strategy = this.determinePartitionStrategy(partitionData);
    
    this.emit('cluster:network_partition', {
      ...partitionData,
      strategy
    });
  }

  /**
   * Determine partition handling strategy
   */
  private determinePartitionStrategy(partitionData: any): string {
    const remainingServers = Array.from(this.servers.keys())
      .filter(serverId => !partitionData.partitionedServers.includes(serverId));
    
    if (remainingServers.length >= Math.ceil(this.servers.size / 2)) {
      return 'maintain_quorum';
    } else {
      return 'split_brain_prevention';
    }
  }

  /**
   * Graceful shutdown
   */
  public async gracefulShutdown(): Promise<void> {
    try {
      logger.info('Starting graceful shutdown', {
        component: 'ClusterManager',
        serverId: this.config.serverId
      });
      
      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      
      // Announce shutdown
      await this.pubClient.publish('cluster:server:shutdown', JSON.stringify({
        serverId: this.config.serverId,
        timestamp: new Date(),
        reason: 'graceful_shutdown'
      }));
      
      // Close adapter
      if (this.adapter) {
        await this.adapter.close();
      }
      
      // Disconnect Redis clients
      if (this.pubClient.isReady) {
        await this.pubClient.disconnect();
      }
      if (this.subClient.isReady) {
        await this.subClient.disconnect();
      }
      
      logger.info('Graceful shutdown completed', {
        component: 'ClusterManager',
        serverId: this.config.serverId
      });
      
    } catch (error) {
      logger.error('Error during graceful shutdown', {
        component: 'ClusterManager',
        serverId: this.config.serverId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Event handler registration methods
   */
  public onServerFailure(callback: (data: any) => void): void {
    this.on('server:failure', callback);
  }

  public onScaleUp(callback: (data: any) => void): void {
    this.on('scale:up', callback);
  }

  public onScaleDown(callback: (data: any) => void): void {
    this.on('scale:down', callback);
  }

  public onPartialFailure(callback: (data: any) => void): void {
    this.on('cluster:partial_failure', callback);
  }

  public onNetworkPartition(callback: (data: any) => void): void {
    this.on('cluster:network_partition', callback);
  }

  /**
   * Utility methods
   */
  private getCurrentCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });
    
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - Math.floor((idle / total) * 100);
    
    this.lastCpuUsage = usage;
    return usage;
  }

  private getCurrentMemoryUsage(): number {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usage = Math.floor(((totalMemory - freeMemory) / totalMemory) * 100);
    
    this.lastMemoryUsage = usage;
    return usage;
  }

  private determineHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    const cpuUsage = this.lastCpuUsage;
    const memoryUsage = this.lastMemoryUsage;
    const connectionRatio = this.connectionCount / this.config.maxConnections!;
    
    if (cpuUsage > 90 || memoryUsage > 90 || connectionRatio > 0.95) {
      return 'unhealthy';
    } else if (cpuUsage > 70 || memoryUsage > 70 || connectionRatio > 0.8) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  private determineServerHealthFromMetrics(metrics: any): 'healthy' | 'degraded' | 'unhealthy' {
    if (metrics.cpuUsage > 90 || metrics.memoryUsage > 90) {
      return 'unhealthy';
    } else if (metrics.cpuUsage > 70 || metrics.memoryUsage > 70) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  /**
   * Update connection count (called by WebSocket server)
   */
  public updateConnectionCount(count: number): void {
    this.connectionCount = count;
    this.peakConnectionCount = Math.max(this.peakConnectionCount, count);
  }
}