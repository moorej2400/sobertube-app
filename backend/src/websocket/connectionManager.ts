/**
 * WebSocket Connection Manager
 * Enhanced connection lifecycle management and session handling
 */

import { logger } from '../utils/logger';
import {
  ConnectionInfo,
  SocketData,
  UserPresencePayload
} from './types';

export interface ConnectionSession {
  userId: string;
  username: string;
  socketIds: Set<string>;
  firstConnectedAt: Date;
  lastActivity: Date;
  reconnectCount: number;
  totalConnectionTime: number;
  isOnline: boolean;
}

export class ConnectionManager {
  private connections: Map<string, ConnectionInfo> = new Map(); // socketId -> ConnectionInfo
  private userSessions: Map<string, ConnectionSession> = new Map(); // userId -> ConnectionSession
  private socketToUser: Map<string, string> = new Map(); // socketId -> userId
  
  // Connection health monitoring
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly INACTIVE_THRESHOLD = 300000; // 5 minutes
  
  constructor() {
    this.startHealthMonitoring();
    
    logger.info('Connection Manager initialized', {
      component: 'ConnectionManager',
      healthCheckInterval: this.HEALTH_CHECK_INTERVAL,
      inactiveThreshold: this.INACTIVE_THRESHOLD
    });
  }

  /**
   * Register a new authenticated connection
   */
  public addConnection(socketId: string, userId: string, username: string): void {
    const now = new Date();
    
    // Create connection info
    const connectionInfo: ConnectionInfo = {
      socketId,
      userId,
      username,
      connectedAt: now,
      lastActivity: now
    };
    
    this.connections.set(socketId, connectionInfo);
    this.socketToUser.set(socketId, userId);
    
    // Update or create user session
    let session = this.userSessions.get(userId);
    if (!session) {
      session = {
        userId,
        username,
        socketIds: new Set(),
        firstConnectedAt: now,
        lastActivity: now,
        reconnectCount: 0,
        totalConnectionTime: 0,
        isOnline: true
      };
      this.userSessions.set(userId, session);
    } else {
      // This is a reconnection
      session.reconnectCount++;
      session.lastActivity = now;
      session.isOnline = true;
    }
    
    session.socketIds.add(socketId);
    
    logger.info('Connection registered', {
      component: 'ConnectionManager',
      socketId,
      userId,
      username,
      isReconnection: session.reconnectCount > 0,
      totalSockets: session.socketIds.size
    });
  }

  /**
   * Remove a connection
   */
  public removeConnection(socketId: string): boolean {
    const connectionInfo = this.connections.get(socketId);
    if (!connectionInfo) {
      return false;
    }
    
    const { userId, username } = connectionInfo;
    const now = new Date();
    
    // Calculate connection time
    const connectionTime = now.getTime() - connectionInfo.connectedAt.getTime();
    
    // Remove connection
    this.connections.delete(socketId);
    this.socketToUser.delete(socketId);
    
    // Update user session
    const session = this.userSessions.get(userId);
    if (session) {
      session.socketIds.delete(socketId);
      session.totalConnectionTime += connectionTime;
      session.lastActivity = now;
      
      // If no more sockets, mark as offline
      if (session.socketIds.size === 0) {
        session.isOnline = false;
      }
    }
    
    logger.info('Connection removed', {
      component: 'ConnectionManager',
      socketId,
      userId,
      username,
      connectionTime,
      remainingSockets: session?.socketIds.size || 0,
      userOnline: session?.isOnline || false
    });
    
    return true;
  }

  /**
   * Update connection activity
   */
  public updateActivity(socketId: string): void {
    const connectionInfo = this.connections.get(socketId);
    const userId = this.socketToUser.get(socketId);
    
    if (connectionInfo && userId) {
      const now = new Date();
      connectionInfo.lastActivity = now;
      
      const session = this.userSessions.get(userId);
      if (session) {
        session.lastActivity = now;
      }
    }
  }

  /**
   * Check if user is online
   */
  public isUserOnline(userId: string): boolean {
    const session = this.userSessions.get(userId);
    return session?.isOnline || false;
  }

  /**
   * Get user's socket IDs
   */
  public getUserSockets(userId: string): string[] {
    const session = this.userSessions.get(userId);
    return session ? Array.from(session.socketIds) : [];
  }

  /**
   * Get all online users
   */
  public getOnlineUsers(): string[] {
    const onlineUsers: string[] = [];
    for (const [userId, session] of this.userSessions) {
      if (session.isOnline) {
        onlineUsers.push(userId);
      }
    }
    return onlineUsers;
  }

  /**
   * Get user presence info
   */
  public getUserPresence(userId: string): UserPresencePayload | null {
    const session = this.userSessions.get(userId);
    if (!session) {
      return null;
    }
    
    return {
      userId,
      username: session.username,
      status: session.isOnline ? 'online' : 'offline',
      lastSeen: session.isOnline ? undefined : session.lastActivity
    };
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats() {
    const totalConnections = this.connections.size;
    const totalUsers = this.userSessions.size;
    const onlineUsers = this.getOnlineUsers().length;
    
    // Calculate average connections per user
    let totalSockets = 0;
    for (const session of this.userSessions.values()) {
      totalSockets += session.socketIds.size;
    }
    
    const avgSocketsPerUser = totalUsers > 0 ? totalSockets / totalUsers : 0;
    
    return {
      totalConnections,
      totalUsers,
      onlineUsers,
      offlineUsers: totalUsers - onlineUsers,
      avgSocketsPerUser: Math.round(avgSocketsPerUser * 100) / 100,
      sessionsWithMultipleSockets: Array.from(this.userSessions.values())
        .filter(session => session.socketIds.size > 1).length
    };
  }

  /**
   * Get detailed connection info for monitoring
   */
  public getDetailedStats() {
    const stats = this.getConnectionStats();
    const sessionDetails = Array.from(this.userSessions.values()).map(session => ({
      userId: session.userId,
      username: session.username,
      isOnline: session.isOnline,
      socketCount: session.socketIds.size,
      reconnectCount: session.reconnectCount,
      totalConnectionTime: session.totalConnectionTime,
      lastActivity: session.lastActivity,
      firstConnectedAt: session.firstConnectedAt
    }));
    
    return {
      ...stats,
      sessions: sessionDetails,
      timestamp: new Date()
    };
  }

  /**
   * Clean up inactive connections
   */
  private cleanupInactiveConnections(): void {
    const now = new Date();
    const inactiveThreshold = now.getTime() - this.INACTIVE_THRESHOLD;
    
    let cleanedConnections = 0;
    let cleanedSessions = 0;
    
    // Clean up inactive connections
    for (const [socketId, connectionInfo] of this.connections) {
      if (connectionInfo.lastActivity.getTime() < inactiveThreshold) {
        this.removeConnection(socketId);
        cleanedConnections++;
      }
    }
    
    // Clean up old offline sessions (older than 24 hours)
    const oldSessionThreshold = now.getTime() - (24 * 60 * 60 * 1000);
    for (const [userId, session] of this.userSessions) {
      if (!session.isOnline && session.lastActivity.getTime() < oldSessionThreshold) {
        this.userSessions.delete(userId);
        cleanedSessions++;
      }
    }
    
    if (cleanedConnections > 0 || cleanedSessions > 0) {
      logger.info('Cleanup completed', {
        component: 'ConnectionManager',
        cleanedConnections,
        cleanedSessions,
        remainingConnections: this.connections.size,
        remainingSessions: this.userSessions.size
      });
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.cleanupInactiveConnections();
      
      // Log periodic stats
      const stats = this.getConnectionStats();
      logger.debug('Connection Manager health check', {
        component: 'ConnectionManager',
        ...stats
      });
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop health monitoring
   */
  public stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    logger.info('Connection Manager stopped', {
      component: 'ConnectionManager',
      finalStats: this.getConnectionStats()
    });
  }

  /**
   * Get connection info by socket ID
   */
  public getConnectionInfo(socketId: string): ConnectionInfo | undefined {
    return this.connections.get(socketId);
  }

  /**
   * Get user session info
   */
  public getUserSession(userId: string): ConnectionSession | undefined {
    return this.userSessions.get(userId);
  }

  /**
   * Force disconnect all user sessions
   */
  public disconnectUser(userId: string): string[] {
    const session = this.userSessions.get(userId);
    if (!session) {
      return [];
    }
    
    const socketIds = Array.from(session.socketIds);
    
    // Remove all connections for this user
    for (const socketId of socketIds) {
      this.removeConnection(socketId);
    }
    
    logger.info('User force disconnected', {
      component: 'ConnectionManager',
      userId,
      username: session.username,
      disconnectedSockets: socketIds.length
    });
    
    return socketIds;
  }
}