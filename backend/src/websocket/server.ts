/**
 * WebSocket Server Implementation
 * Core Socket.IO server with authentication, connection management, and event handling
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  SocketAuthPayload,
  SocketErrorPayload,
  ConnectionInfo
} from './types';

import { webSocketEventsService } from '../services/websocketEvents';
import { ConnectionManager } from './connectionManager';
import { WebSocketClusterManager } from './clusterManager';
import { presenceManager } from '../services/presenceManager';

export class WebSocketServer {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  
  // Connection management
  private connectionManager: ConnectionManager;
  
  // Cluster management (optional for horizontal scaling)
  private clusterManager?: WebSocketClusterManager;
  
  // User tracking maps  
  private connectedUsers: Map<string, any> = new Map(); // socketId -> ConnectionInfo
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>
  
  // Rate limiting
  private rateLimits: Map<string, any> = new Map();
  private rateLimitConfig = {
    windowMs: 60000, // 1 minute
    maxRequests: 100, // 100 requests per minute
    message: 'Rate limit exceeded. Please slow down.'
  };

  constructor(httpServer: HTTPServer, enableClustering = false) {
    // Initialize connection manager
    this.connectionManager = new ConnectionManager();
    
    // Initialize cluster manager if clustering is enabled
    if (enableClustering && process.env['REDIS_URL']) {
      this.clusterManager = new WebSocketClusterManager({
        redisUrl: process.env['REDIS_URL'],
        serverId: process.env['SERVER_ID'] || `server-${process.pid}`,
        serverPort: parseInt(process.env['PORT'] || '3001')
      });
      
      logger.info('WebSocket clustering enabled', {
        component: 'WebSocketServer',
        serverId: this.clusterManager['config'].serverId,
        redisUrl: process.env['REDIS_URL']
      });
    }
    
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
    
    // Initialize WebSocket events service
    webSocketEventsService.setWebSocketServer(this);
    
    // Setup clustering if enabled
    if (this.clusterManager) {
      this.setupClustering();
    }
    
    // Initialize presence manager
    presenceManager.setConnectionManager(this.connectionManager);
    
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
      // Note: Not awaiting to avoid blocking connection setup
      this.handleAuthenticatedConnection(socket).catch(error => {
        logger.error('Failed to handle authenticated connection', {
          component: 'WebSocketServer',
          error: error instanceof Error ? error.message : 'Unknown error',
          socketId: socket.id,
          userId: socket.userId
        });
      });
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
  private async handleAuthenticatedConnection(socket: any): Promise<void> {
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
    
    // Add connection to connection manager
    this.connectionManager.addConnection(socket.id, userId, username);
    
    // Join user's personal room
    socket.join(`user:${userId}`);
    socket.data.roomsJoined.push(`user:${userId}`);
    
    // Emit authentication success
    socket.emit('authenticated', { userId, username });
    
    // Broadcast user online status to followers
    await this.broadcastUserPresence(userId, username, 'online');
    
    logger.info('Authenticated user connected', {
      component: 'WebSocketServer',
      socketId: socket.id,
      userId,
      username,
      totalUserSockets: this.userSockets.get(userId)!.size
    });
    
    // Update cluster connection count
    this.updateClusterConnectionCount();
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
        
        // Note: Not awaiting to avoid blocking authentication response
        this.handleAuthenticatedConnection(socket).catch(error => {
          logger.error('Failed to handle authenticated connection after manual auth', {
            component: 'WebSocketServer',
            error: error instanceof Error ? error.message : 'Unknown error',
            socketId: socket.id,
            userId: socket.userId
          });
        });
        
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
      // Note: Not awaiting to avoid blocking disconnect event
      this.handleDisconnection(socket, reason).catch(error => {
        logger.error('Failed to handle disconnection', {
          component: 'WebSocketServer',
          error: error instanceof Error ? error.message : 'Unknown error',
          socketId: socket.id,
          userId: socket.userId
        });
      });
    });

    // Handle manual disconnect
    socket.on('disconnect_user', () => {
      socket.disconnect(true);
    });

    // Handle content room management
    socket.on('join_content', (payload: { contentType: 'video' | 'post'; contentId: string }) => {
      if (!socket.isAuthenticated) {
        socket.emit('error', {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required to join content rooms'
        });
        return;
      }

      const { contentType, contentId } = payload;
      
      // Validate content type
      if (!['video', 'post'].includes(contentType)) {
        socket.emit('error', {
          code: 'INVALID_CONTENT_TYPE',
          message: 'Content type must be either "video" or "post"'
        });
        return;
      }

      // Validate content ID format (UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(contentId)) {
        socket.emit('error', {
          code: 'INVALID_CONTENT_ID',
          message: 'Content ID must be a valid UUID'
        });
        return;
      }

      const roomName = `content:${contentType}:${contentId}`;
      
      // Join the room
      socket.join(roomName);
      socket.data.roomsJoined.push(roomName);

      logger.info('User joined content room', {
        component: 'WebSocketServer',
        socketId: socket.id,
        userId: socket.userId,
        username: socket.username,
        contentType,
        contentId,
        roomName
      });
    });

    socket.on('leave_content', (payload: { contentType: 'video' | 'post'; contentId: string }) => {
      if (!socket.isAuthenticated) {
        return; // Silently ignore if not authenticated
      }

      const { contentType, contentId } = payload;
      const roomName = `content:${contentType}:${contentId}`;
      
      // Leave the room
      socket.leave(roomName);
      
      // Remove from tracked rooms
      const roomIndex = socket.data.roomsJoined.indexOf(roomName);
      if (roomIndex > -1) {
        socket.data.roomsJoined.splice(roomIndex, 1);
      }

      logger.info('User left content room', {
        component: 'WebSocketServer',
        socketId: socket.id,
        userId: socket.userId,
        username: socket.username,
        contentType,
        contentId,
        roomName
      });
    });

    // Handle feed interactions
    socket.on('request_instant_refresh', async () => {
      if (!socket.isAuthenticated || !socket.userId) {
        socket.emit('error', {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required for feed refresh'
        });
        return;
      }

      try {
        const { feedUpdatesService } = await import('../services/feedUpdates');
        
        // Generate personalized feed updates
        const personalizedUpdates = await feedUpdatesService.generatePersonalizedFeedUpdates(
          socket.userId, 
          10
        );

        // Send instant refresh with personalized content
        for (const update of personalizedUpdates) {
          socket.emit('feed:instant_refresh', update);
        }

        logger.info('Instant feed refresh processed for user', {
          component: 'WebSocketServer',
          socketId: socket.id,
          userId: socket.userId,
          updateCount: personalizedUpdates.length
        });

      } catch (error) {
        logger.error('Failed to process instant feed refresh', {
          component: 'WebSocketServer',
          error: error instanceof Error ? error.message : 'Unknown error',
          socketId: socket.id,
          userId: socket.userId
        });

        socket.emit('error', {
          code: 'FEED_REFRESH_FAILED',
          message: 'Failed to refresh feed'
        });
      }
    });

    socket.on('request_personalized_feed', async (payload: { preferences?: string[] }) => {
      if (!socket.isAuthenticated || !socket.userId) {
        socket.emit('error', {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required for personalized feed'
        });
        return;
      }

      try {
        const { feedUpdatesService } = await import('../services/feedUpdates');
        
        // Generate personalized feed updates
        const personalizedUpdates = await feedUpdatesService.generatePersonalizedFeedUpdates(
          socket.userId, 
          20 // More items for personalized feed request
        );

        // Send personalized updates
        for (const update of personalizedUpdates) {
          socket.emit('feed:personalized_update', update);
        }

        logger.info('Personalized feed processed for user', {
          component: 'WebSocketServer',
          socketId: socket.id,
          userId: socket.userId,
          updateCount: personalizedUpdates.length,
          hasPreferences: !!(payload.preferences && payload.preferences.length > 0)
        });

      } catch (error) {
        logger.error('Failed to process personalized feed', {
          component: 'WebSocketServer',
          error: error instanceof Error ? error.message : 'Unknown error',
          socketId: socket.id,
          userId: socket.userId
        });

        socket.emit('error', {
          code: 'PERSONALIZED_FEED_FAILED',
          message: 'Failed to generate personalized feed'
        });
      }
    });

    socket.on('report_feed_conflict', (payload: { updateId: string; issue: string }) => {
      if (!socket.isAuthenticated || !socket.userId) {
        return; // Silently ignore if not authenticated
      }

      // Log feed conflict report for monitoring
      logger.warn('Feed conflict reported by user', {
        component: 'WebSocketServer',
        socketId: socket.id,
        userId: socket.userId,
        updateId: payload.updateId,
        issue: payload.issue
      });

      // For now, just acknowledge the report
      socket.emit('feed:conflict_resolved', {
        updateId: payload.updateId,
        resolution: 'reported',
        timestamp: new Date()
      });
    });

    // Handle recommendation requests
    socket.on('request_recommendations', async (payload: { limit?: number; preferences?: string[] }) => {
      if (!socket.isAuthenticated || !socket.userId) {
        socket.emit('error', {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required for recommendations'
        });
        return;
      }

      try {
        const { RecommendationEngine } = await import('../services/recommendationEngine');
        const recommendationEngine = RecommendationEngine.getInstance();
        
        const recommendations = await recommendationEngine.generatePersonalizedRecommendations(
          socket.userId,
          payload.limit || 5
        );

        if (recommendations.length === 0) {
          socket.emit('recommendation:no_results', {
            message: 'No recommendations available at this time'
          });
          return;
        }

        // Send each recommendation individually for real-time delivery
        for (const recommendation of recommendations) {
          socket.emit('recommendation:personalized', recommendation);
        }

        logger.info('Personalized recommendations sent to user', {
          component: 'WebSocketServer',
          socketId: socket.id,
          userId: socket.userId,
          recommendationCount: recommendations.length
        });

      } catch (error) {
        logger.error('Failed to generate recommendations', {
          component: 'WebSocketServer',
          error: error instanceof Error ? error.message : 'Unknown error',
          socketId: socket.id,
          userId: socket.userId
        });

        socket.emit('error', {
          code: 'RECOMMENDATIONS_FAILED',
          message: 'Failed to generate recommendations'
        });
      }
    });

    socket.on('request_trending_content', async (payload: { timeWindow?: '1h' | '6h' | '24h'; category?: string }) => {
      if (!socket.isAuthenticated || !socket.userId) {
        socket.emit('error', {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required for trending content'
        });
        return;
      }

      try {
        const { RecommendationEngine } = await import('../services/recommendationEngine');
        const recommendationEngine = RecommendationEngine.getInstance();
        
        const trendingContent = await recommendationEngine.detectTrendingContent(
          10,
          payload.timeWindow || '24h'
        );

        if (trendingContent.length === 0) {
          socket.emit('recommendation:no_trending', {
            message: 'No trending content available',
            timeWindow: payload.timeWindow || '24h'
          });
          return;
        }

        // Send trending content updates
        for (const content of trendingContent) {
          socket.emit('recommendation:trending_content', content);
        }

        logger.info('Trending content sent to user', {
          component: 'WebSocketServer',
          socketId: socket.id,
          userId: socket.userId,
          contentCount: trendingContent.length,
          timeWindow: payload.timeWindow || '24h'
        });

      } catch (error) {
        logger.error('Failed to fetch trending content', {
          component: 'WebSocketServer',
          error: error instanceof Error ? error.message : 'Unknown error',
          socketId: socket.id,
          userId: socket.userId
        });

        socket.emit('error', {
          code: 'TRENDING_CONTENT_FAILED',
          message: 'Failed to fetch trending content'
        });
      }
    });

    socket.on('recommendation_feedback', async (payload: {
      userId: string;
      postId: string;
      feedback: string;
      feedbackType: 'view' | 'like' | 'share' | 'dismiss' | 'report';
      timestamp: Date;
    }) => {
      if (!socket.isAuthenticated || !socket.userId) {
        socket.emit('error', {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required for feedback'
        });
        return;
      }

      // Validate feedback type
      const validFeedbackTypes = ['positive', 'negative', 'neutral'];
      if (!validFeedbackTypes.includes(payload.feedback)) {
        socket.emit('error', {
          code: 'INVALID_FEEDBACK_TYPE',
          message: 'Feedback must be positive, negative, or neutral'
        });
        return;
      }

      // Ensure the feedback is from the authenticated user
      if (payload.userId !== socket.userId) {
        socket.emit('error', {
          code: 'UNAUTHORIZED_FEEDBACK',
          message: 'Can only provide feedback for your own account'
        });
        return;
      }

      try {
        const { RecommendationEngine } = await import('../services/recommendationEngine');
        const recommendationEngine = RecommendationEngine.getInstance();
        
        await recommendationEngine.processRecommendationFeedback(
          payload.userId,
          payload.postId,
          payload.feedback
        );

        // Acknowledge feedback processing
        socket.emit('recommendation:feedback_processed', {
          postId: payload.postId,
          feedback: payload.feedback,
          timestamp: payload.timestamp
        });

        logger.info('Recommendation feedback processed', {
          component: 'WebSocketServer',
          socketId: socket.id,
          userId: socket.userId,
          postId: payload.postId,
          feedback: payload.feedback
        });

      } catch (error) {
        logger.error('Failed to process recommendation feedback', {
          component: 'WebSocketServer',
          error: error instanceof Error ? error.message : 'Unknown error',
          socketId: socket.id,
          userId: socket.userId,
          postId: payload.postId
        });

        socket.emit('error', {
          code: 'FEEDBACK_PROCESSING_FAILED',
          message: 'Failed to process recommendation feedback'
        });
      }
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
        
        // Update activity in connection manager
        this.connectionManager.updateActivity(socket.id);
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
  private async handleDisconnection(socket: any, reason: string): Promise<void> {
    const startTime = Date.now();
    
    logger.info('WebSocket disconnection', {
      component: 'WebSocketServer',
      socketId: socket.id,
      userId: socket.userId,
      reason,
      wasAuthenticated: socket.isAuthenticated,
      roomsJoined: socket.data?.roomsJoined || []
    });

    // Clean up authenticated user
    if (socket.isAuthenticated && socket.userId) {
      const userId = socket.userId;
      const username = socket.username!;
      
      // Remove from connected users
      this.connectedUsers.delete(socket.id);
      
      // Remove connection from connection manager
      this.connectionManager.removeConnection(socket.id);
      
      // Remove socket from user sockets
      const userSocketSet = this.userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(socket.id);
        
        // If user has no more sockets, remove from map and broadcast offline
        if (userSocketSet.size === 0) {
          this.userSockets.delete(userId);
          await this.broadcastUserPresence(userId, username, 'offline');
        }
      }
      
      // Clean up rate limits (optional, or keep for a while)
      // this.rateLimits.delete(userId);
      
      // Update cluster connection count
      this.updateClusterConnectionCount();
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
  private async broadcastUserPresence(userId: string, username: string, status: 'online' | 'offline'): Promise<void> {
    try {
      // Import presence manager
      const { presenceManager } = await import('../services/presenceManager');
      
      // Broadcast presence change to followers
      await presenceManager.broadcastPresenceChange(userId, username, status);
      
    } catch (error) {
      logger.error('Failed to broadcast user presence', {
        component: 'WebSocketServer',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        username,
        status
      });
    }
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

  /**
   * Setup clustering functionality
   */
  private async setupClustering(): Promise<void> {
    if (!this.clusterManager) {
      return;
    }
    
    try {
      // Setup Redis adapter for Socket.IO
      await this.clusterManager.setupRedisAdapter(this.io);
      
      // Register this server in the cluster
      await this.clusterManager.registerServer();
      
      // Start heartbeat mechanism
      await this.clusterManager.startHeartbeat();
      
      // Setup cluster event handlers
      this.setupClusterEventHandlers();
      
      logger.info('WebSocket clustering setup completed', {
        component: 'WebSocketServer',
        serverId: this.clusterManager['config'].serverId
      });
      
    } catch (error) {
      logger.error('Failed to setup WebSocket clustering', {
        component: 'WebSocketServer',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Continue without clustering
      this.clusterManager = undefined;
    }
  }

  /**
   * Setup cluster event handlers
   */
  private setupClusterEventHandlers(): void {
    if (!this.clusterManager) {
      return;
    }
    
    // Handle cluster broadcast events
    this.clusterManager.on('cluster:broadcast', (eventData: any) => {
      this.io.emit(eventData.type, eventData.data);
    });
    
    // Handle cluster user events
    this.clusterManager.on('cluster:user_event', (eventData: any) => {
      if (eventData.targetUserId) {
        this.broadcastToUser(eventData.targetUserId, eventData.type, eventData.data);
      }
    });
    
    // Handle batch events
    this.clusterManager.on('cluster:batch_events', (events: any[]) => {
      events.forEach(event => {
        this.io.emit(event.type, event.data);
      });
    });
    
    // Handle server failures
    this.clusterManager.on('server:failure', (failureData: any) => {
      logger.warn('Cluster server failure detected', {
        component: 'WebSocketServer',
        failedServer: failureData.serverId,
        reason: failureData.reason
      });
      // Handle connection migration if needed
    });
    
    // Handle scaling events
    this.clusterManager.on('scale:up', (scaleData: any) => {
      logger.info('Cluster scale-up event', {
        component: 'WebSocketServer',
        scaleData
      });
    });
    
    this.clusterManager.on('scale:down', (scaleData: any) => {
      logger.info('Cluster scale-down event', {
        component: 'WebSocketServer',
        scaleData
      });
    });
  }

  /**
   * Get cluster manager instance
   */
  public getClusterManager(): WebSocketClusterManager | undefined {
    return this.clusterManager;
  }

  /**
   * Update connection count for cluster manager
   */
  private updateClusterConnectionCount(): void {
    if (this.clusterManager) {
      this.clusterManager.updateConnectionCount(this.connectedUsers.size);
    }
  }
}