/**
 * WebSocket Connection Pool
 * Advanced connection management with load balancing and health monitoring
 */

import { logger } from '../utils/logger';

export interface ConnectionPoolConfig {
  maxConnections: number;
  maxConnectionsPerUser: number;
  connectionTimeout?: number;
  cleanupInterval?: number;
  loadBalancing?: boolean;
  workerCount?: number;
  rebalanceThreshold?: number;
}

export interface PoolConnection {
  socketId: string;
  userId: string;
  username: string;
  workerId: number;
  connectedAt: Date;
  lastActivity: Date;
  isHealthy: boolean;
  healthIssue?: string;
}

export interface HealthMetrics {
  totalConnections: number;
  averageResponseTime: number;
  errorRate: number;
  lastUpdated: Date;
}

export interface UnhealthyConnection {
  socketId: string;
  userId: string;
  issue: string;
  detectedAt: Date;
}

export interface PoolStatistics {
  totalConnections: number;
  uniqueUsers: number;
  averageConnectionsPerUser: number;
  poolUtilization: number;
  workerDistribution: number[];
}

export class ConnectionPool {
  private config: Required<ConnectionPoolConfig>;
  private connections: Map<string, PoolConnection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private workerLoads: number[] = [];
  private cleanupInterval: NodeJS.Timeout | null = null;
  private shuttingDown = false;
  private responseTimes: number[] = [];
  private errorCount = 0;
  private totalRequests = 0;

  constructor(config: ConnectionPoolConfig) {
    this.config = {
      maxConnections: config.maxConnections,
      maxConnectionsPerUser: config.maxConnectionsPerUser,
      connectionTimeout: config.connectionTimeout || 30000,
      cleanupInterval: config.cleanupInterval || 60000,
      loadBalancing: config.loadBalancing || false,
      workerCount: config.workerCount || 4,
      rebalanceThreshold: config.rebalanceThreshold || 10
    };

    // Initialize worker loads
    this.workerLoads = new Array(this.config.workerCount).fill(0);

    // Start cleanup interval
    this.startCleanupInterval();

    logger.info('Connection pool initialized', {
      component: 'ConnectionPool',
      config: this.config
    });
  }

  /**
   * Add a new connection to the pool
   */
  public addConnection(socketId: string, userId: string, username: string): boolean {
    if (this.shuttingDown) {
      logger.warn('Rejecting connection during shutdown', {
        component: 'ConnectionPool',
        socketId,
        userId
      });
      return false;
    }

    // Check global connection limit
    if (this.connections.size >= this.config.maxConnections) {
      logger.warn('Connection pool at capacity', {
        component: 'ConnectionPool',
        currentConnections: this.connections.size,
        maxConnections: this.config.maxConnections,
        rejectedSocketId: socketId,
        rejectedUserId: userId
      });
      return false;
    }

    // Check per-user connection limit
    const userConnectionCount = this.userConnections.get(userId)?.size || 0;
    if (userConnectionCount >= this.config.maxConnectionsPerUser) {
      logger.warn('User connection limit reached', {
        component: 'ConnectionPool',
        userId,
        currentConnections: userConnectionCount,
        maxConnectionsPerUser: this.config.maxConnectionsPerUser,
        rejectedSocketId: socketId
      });
      return false;
    }

    // Select optimal worker if load balancing is enabled
    const workerId = this.config.loadBalancing ? this.getOptimalWorker() : 0;

    // Create connection entry
    const connection: PoolConnection = {
      socketId,
      userId,
      username,
      workerId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      isHealthy: true
    };

    // Add to maps
    this.connections.set(socketId, connection);
    
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(socketId);

    // Update worker load
    if (this.config.loadBalancing) {
      this.workerLoads[workerId]++;
      this.rebalanceIfNeeded();
    }

    logger.debug('Connection added to pool', {
      component: 'ConnectionPool',
      socketId,
      userId,
      username,
      workerId,
      totalConnections: this.connections.size
    });

    return true;
  }

  /**
   * Remove a connection from the pool
   */
  public removeConnection(socketId: string): boolean {
    const connection = this.connections.get(socketId);
    if (!connection) {
      return false;
    }

    const { userId, workerId } = connection;

    // Remove from connections
    this.connections.delete(socketId);

    // Remove from user connections
    const userSockets = this.userConnections.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.userConnections.delete(userId);
      }
    }

    // Update worker load
    if (this.config.loadBalancing) {
      this.workerLoads[workerId]--;
    }

    logger.debug('Connection removed from pool', {
      component: 'ConnectionPool',
      socketId,
      userId,
      workerId,
      totalConnections: this.connections.size
    });

    return true;
  }

  /**
   * Get optimal worker for load balancing
   */
  public getOptimalWorker(): number {
    if (!this.config.loadBalancing) {
      return 0;
    }

    let minLoad = this.workerLoads[0];
    let optimalWorker = 0;

    for (let i = 1; i < this.workerLoads.length; i++) {
      if (this.workerLoads[i] < minLoad) {
        minLoad = this.workerLoads[i];
        optimalWorker = i;
      }
    }

    return optimalWorker;
  }

  /**
   * Rebalance connections if needed
   */
  private rebalanceIfNeeded(): void {
    const maxLoad = Math.max(...this.workerLoads);
    const minLoad = Math.min(...this.workerLoads);

    if (maxLoad - minLoad > this.config.rebalanceThreshold) {
      logger.info('Rebalancing worker loads', {
        component: 'ConnectionPool',
        maxLoad,
        minLoad,
        threshold: this.config.rebalanceThreshold,
        currentDistribution: this.workerLoads
      });

      // Simple rebalancing: redistribute some connections from overloaded workers
      this.redistributeConnections();
    }
  }

  /**
   * Redistribute connections across workers
   */
  private redistributeConnections(): void {
    // Find the most loaded worker
    const maxLoadWorker = this.workerLoads.indexOf(Math.max(...this.workerLoads));
    const minLoadWorker = this.workerLoads.indexOf(Math.min(...this.workerLoads));

    // Move one connection from max to min worker
    for (const [socketId, connection] of this.connections) {
      if (connection.workerId === maxLoadWorker) {
        connection.workerId = minLoadWorker;
        this.workerLoads[maxLoadWorker]--;
        this.workerLoads[minLoadWorker]++;
        
        logger.debug('Connection redistributed', {
          component: 'ConnectionPool',
          socketId,
          fromWorker: maxLoadWorker,
          toWorker: minLoadWorker
        });
        break;
      }
    }
  }

  /**
   * Mark a connection as unhealthy
   */
  public markConnectionUnhealthy(socketId: string, issue: string): void {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.isHealthy = false;
      connection.healthIssue = issue;
      
      logger.warn('Connection marked as unhealthy', {
        component: 'ConnectionPool',
        socketId,
        userId: connection.userId,
        issue
      });
    }
  }

  /**
   * Get unhealthy connections
   */
  public getUnhealthyConnections(): UnhealthyConnection[] {
    const unhealthyConnections: UnhealthyConnection[] = [];
    
    for (const connection of this.connections.values()) {
      if (!connection.isHealthy && connection.healthIssue) {
        unhealthyConnections.push({
          socketId: connection.socketId,
          userId: connection.userId,
          issue: connection.healthIssue,
          detectedAt: connection.lastActivity
        });
      }
    }

    return unhealthyConnections;
  }

  /**
   * Start cleanup interval for timed out connections
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupTimedOutConnections();
    }, this.config.cleanupInterval);
  }

  /**
   * Clean up timed out connections
   */
  public cleanupTimedOutConnections(): void {
    const now = new Date();
    const timedOutConnections: string[] = [];

    for (const [socketId, connection] of this.connections) {
      const timeSinceActivity = now.getTime() - connection.lastActivity.getTime();
      
      if (timeSinceActivity > this.config.connectionTimeout) {
        timedOutConnections.push(socketId);
      }
    }

    for (const socketId of timedOutConnections) {
      this.removeConnection(socketId);
    }

    if (timedOutConnections.length > 0) {
      logger.info('Cleaned up timed out connections', {
        component: 'ConnectionPool',
        cleanedConnections: timedOutConnections.length,
        totalConnections: this.connections.size
      });
    }
  }

  // Getter methods for testing and monitoring
  public getMaxConnections(): number {
    return this.config.maxConnections;
  }

  public getMaxConnectionsPerUser(): number {
    return this.config.maxConnectionsPerUser;
  }

  public isLoadBalancingEnabled(): boolean {
    return this.config.loadBalancing;
  }

  public getActiveConnections(): number {
    return this.connections.size;
  }

  public getWorkerDistribution(): number[] {
    return [...this.workerLoads];
  }

  public getHealthMetrics(): HealthMetrics {
    const avgResponseTime = this.responseTimes.length > 0 
      ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length
      : 0;

    const errorRate = this.totalRequests > 0 ? this.errorCount / this.totalRequests : 0;

    return {
      totalConnections: this.connections.size,
      averageResponseTime: avgResponseTime,
      errorRate,
      lastUpdated: new Date()
    };
  }

  public getPoolStatistics(): PoolStatistics {
    return {
      totalConnections: this.connections.size,
      uniqueUsers: this.userConnections.size,
      averageConnectionsPerUser: this.userConnections.size > 0 
        ? this.connections.size / this.userConnections.size
        : 0,
      poolUtilization: this.connections.size / this.config.maxConnections,
      workerDistribution: [...this.workerLoads]
    };
  }

  public isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  public startShutdown(): void {
    this.shuttingDown = true;
    logger.info('Connection pool shutdown initiated', {
      component: 'ConnectionPool',
      activeConnections: this.connections.size
    });
  }

  public async gracefulShutdown(timeoutMs: number = 10000): Promise<void> {
    this.startShutdown();

    const startTime = Date.now();
    
    // Wait for connections to close naturally or timeout
    while (this.connections.size > 0 && (Date.now() - startTime) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Force close remaining connections
    this.connections.clear();
    this.userConnections.clear();
    this.workerLoads.fill(0);

    logger.info('Connection pool graceful shutdown completed', {
      component: 'ConnectionPool',
      forcedCloseCount: this.connections.size,
      shutdownTime: Date.now() - startTime
    });
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.connections.clear();
    this.userConnections.clear();
    this.workerLoads.fill(0);
    this.shuttingDown = true;

    logger.info('Connection pool destroyed', {
      component: 'ConnectionPool'
    });
  }
}