/**
 * WebSocket Server Implementation
 * Core Socket.IO server with authentication, connection management, and event handling
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '../utils/logger';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  SocketAuthPayload,
  SocketErrorPayload
} from './types';
import { ConnectionManager } from './connectionManager';
import { WebSocketAuthMiddleware } from './authMiddleware';

export class WebSocketServer {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  private connectionManager: ConnectionManager;
  private authMiddleware: WebSocketAuthMiddleware;

  constructor(httpServer: HTTPServer) {
    // Initialize components
    this.connectionManager = new ConnectionManager();
    this.authMiddleware = new WebSocketAuthMiddleware();
    
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env['NODE_ENV'] === 'production' 
          ? process.env['FRONTEND_URL'] || false
          : true,
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e6, // 1MB
      allowEIO3: true
    });
    
    this.setupMiddleware();
    this.setupEventHandlers();
    
    logger.info('WebSocket server initialized', {
      component: 'WebSocketServer',
      config: {
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket', 'polling']
      }
    });
  }

  /**
   * Setup Socket.IO middleware for authentication and rate limiting
   */
  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket: any, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
        
        if (!token) {
          socket.isAuthenticated = false;
          return next();
        }

        const decoded = jwt.verify(token, config.jwtSecret) as any;
        
        if (!decoded.userId || !decoded.username) {
          socket.isAuthenticated = false;
          return next();
        }

        socket.userId = decoded.userId;
        socket.username = decoded.username;
        socket.isAuthenticated = true;
        
        logger.info('Socket authenticated', {
          component: 'WebSocketServer',
          socketId: socket.id,
          userId: decoded.userId,
          username: decoded.username
        });
        
        next();
      } catch (error) {
        logger.warn('Socket authentication failed', {
          component: 'WebSocketServer',
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        socket.isAuthenticated = false;
        next();
      }
    });

    // Rate limiting middleware
    this.io.use((socket: any, next) => {
      if (!socket.isAuthenticated || !socket.userId) {
        return next();
      }

      const userId = socket.userId;
      const now = Date.now();
      
      if (!this.rateLimits.has(userId)) {
        this.rateLimits.set(userId, {});
      }
      
      const userLimits = this.rateLimits.get(userId)!;
      
      if (!userLimits[userId] || now > userLimits[userId].resetTime) {
        userLimits[userId] = {
          requests: 1,
          resetTime: now + this.rateLimitConfig.windowMs
        };
      } else {
        userLimits[userId].requests++;
        
        if (userLimits[userId].requests > this.rateLimitConfig.maxRequests) {
          const error: SocketErrorPayload = {
            code: 'RATE_LIMIT_EXCEEDED',
            message: this.rateLimitConfig.message
          };
          
          socket.emit('error', error);
          return next(new Error('Rate limit exceeded'));
        }
      }
      
      next();
    });
  }

  /**
   * Setup main Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket: any) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: any): void {
    const startTime = Date.now();
    
    logger.info('New WebSocket connection', {
      component: 'WebSocketServer',
      socketId: socket.id,
      isAuthenticated: socket.isAuthenticated,
      userId: socket.userId,
      username: socket.username,
      userAgent: socket.handshake.headers['user-agent'],
      ip: socket.handshake.address
    });

    // Initialize socket data
    socket.data = {
      userId: socket.userId,
      username: socket.username,
      isAuthenticated: socket.isAuthenticated,
      connectedAt: new Date(),
      lastActivity: new Date(),
      roomsJoined: []
    };

    // Handle authenticated users
    if (socket.isAuthenticated && socket.userId && socket.username) {
      this.handleAuthenticatedConnection(socket);
    }

    // Setup connection event handlers
    this.setupConnectionEventHandlers(socket);

    // Connection established successfully
    const connectionTime = Date.now() - startTime;
    logger.info('WebSocket connection established', {
      component: 'WebSocketServer',
      socketId: socket.id,
      userId: socket.userId,
      connectionTime
    });
  }

  /**
   * Handle authenticated user connection
   */
  private handleAuthenticatedConnection(socket: any): void {
    const userId = socket.userId!;
    const username = socket.username!;
    
    // Track connection info
    const connectionInfo: ConnectionInfo = {
      socketId: socket.id,
      userId,
      username,
      connectedAt: new Date(),
      lastActivity: new Date()
    };
    
    this.connectedUsers.set(socket.id, connectionInfo);
    
    // Track user sockets
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket.id);
    
    // Join user's personal room
    socket.join(`user:${userId}`);
    socket.data.roomsJoined.push(`user:${userId}`);
    
    // Emit authentication success
    socket.emit('authenticated', { userId, username });
    
    // Broadcast user online status to followers (implement later)
    this.broadcastUserPresence(userId, username, 'online');
    
    logger.info('Authenticated user connected', {
      component: 'WebSocketServer',
      socketId: socket.id,
      userId,
      username,
      totalUserSockets: this.userSockets.get(userId)!.size
    });
  }

  /**
   * Setup event handlers for individual socket connection
   */
  private setupConnectionEventHandlers(socket: any): void {
    // Handle manual authentication
    socket.on('authenticate', async (payload: SocketAuthPayload) => {
      if (socket.isAuthenticated) {
        return;
      }
      
      try {
        const decoded = jwt.verify(payload.token, config.jwtSecret) as any;
        
        if (!decoded.userId || !decoded.username) {
          socket.emit('unauthenticated', { reason: 'Invalid token payload' });
          return;
        }
        
        socket.userId = decoded.userId;
        socket.username = decoded.username;
        socket.isAuthenticated = true;
        socket.data.userId = decoded.userId;
        socket.data.username = decoded.username;
        socket.data.isAuthenticated = true;
        
        this.handleAuthenticatedConnection(socket);
        
      } catch (error) {
        logger.warn('Authentication failed', {
          component: 'WebSocketServer',
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        socket.emit('unauthenticated', { 
          reason: error instanceof Error ? error.message : 'Authentication failed' 
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason: string) => {
      this.handleDisconnection(socket, reason);
    });

    // Handle manual disconnect
    socket.on('disconnect_user', () => {
      socket.disconnect(true);
    });

    // Update last activity on any event
    socket.onAny(() => {
      if (socket.data) {
        socket.data.lastActivity = new Date();
      }
      
      if (socket.isAuthenticated && socket.userId) {
        const connectionInfo = this.connectedUsers.get(socket.id);
        if (connectionInfo) {
          connectionInfo.lastActivity = new Date();
        }
      }
    });

    // Handle errors
    socket.on('error', (error: any) => {
      logger.error('Socket error', {
        component: 'WebSocketServer',
        socketId: socket.id,
        userId: socket.userId,
        error: error instanceof Error ? error.message : 'Unknown socket error',
        stack: error instanceof Error ? error.stack : undefined
      });
    });
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(socket: any, reason: string): void {
    const startTime = Date.now();
    
    logger.info('WebSocket disconnection', {
      component: 'WebSocketServer',
      socketId: socket.id,
      userId: socket.userId,
      reason,
      wasAuthenticated: socket.isAuthenticated
    });

    // Clean up authenticated user
    if (socket.isAuthenticated && socket.userId) {
      const userId = socket.userId;
      const username = socket.username!;
      
      // Remove from connected users
      this.connectedUsers.delete(socket.id);
      
      // Remove socket from user sockets
      const userSocketSet = this.userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(socket.id);
        
        // If user has no more sockets, remove from map and broadcast offline
        if (userSocketSet.size === 0) {
          this.userSockets.delete(userId);
          this.broadcastUserPresence(userId, username, 'offline');
        }
      }
      
      // Clean up rate limits (optional, or keep for a while)
      // this.rateLimits.delete(userId);
    }

    const disconnectionTime = Date.now() - startTime;
    logger.info('WebSocket disconnection cleanup completed', {
      component: 'WebSocketServer',
      socketId: socket.id,
      userId: socket.userId,
      disconnectionTime,
      totalConnectedUsers: this.connectedUsers.size
    });
  }

  /**
   * Broadcast user presence to relevant users
   * This is a placeholder - will be expanded when implementing follows system integration
   */
  private broadcastUserPresence(userId: string, username: string, status: 'online' | 'offline'): void {
    // For now, just log the presence change
    // Later this will broadcast to followers and relevant rooms
    logger.info('User presence changed', {
      component: 'WebSocketServer',
      userId,
      username,
      status,
      timestamp: new Date().toISOString()
    });
    
    // TODO: Implement broadcasting to followers and relevant rooms
    // this.io.to('followers:' + userId).emit('user:presence', {
    //   userId,
    //   username,
    //   status,
    //   lastSeen: status === 'offline' ? new Date() : undefined
    // });
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats() {
    return {
      totalConnections: this.connectedUsers.size,
      totalUsers: this.userSockets.size,
      connections: Array.from(this.connectedUsers.values()),
      averageSocketsPerUser: this.userSockets.size > 0 
        ? Array.from(this.userSockets.values()).reduce((sum, sockets) => sum + sockets.size, 0) / this.userSockets.size
        : 0
    };
  }

  /**
   * Broadcast to specific user across all their sockets
   */
  public broadcastToUser(userId: string, event: string, data: any): void {
    this.io.to(`user:${userId}`).emit(event as any, data);
  }

  /**
   * Broadcast to all authenticated users
   */
  public broadcastToAll(event: string, data: any): void {
    this.io.emit(event as any, data);
  }

  /**
   * Get Socket.IO server instance
   */
  public getIOServer(): SocketIOServer {
    return this.io;
  }

  /**
   * Check if user is online
   */
  public isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  /**
   * Get all online users
   */
  public getOnlineUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }
}