/**
 * WebSocket Events Service
 * Centralized service for emitting real-time events through WebSocket connections
 */

import { logger } from '../utils/logger';
import { 
  LikeEventPayload, 
  CommentEventPayload, 
  FollowEventPayload, 
  NotificationPayload,
  FeedUpdatePayload,
  PriorityFeedUpdatePayload,
  UserPresencePayload,
  UserActivityPayload
} from '../websocket/types';
import { getRedisCacheService } from './redisCacheService';
import { NotificationFilteringService } from './notificationFilteringService';

export class WebSocketEventsService {
  private static instance: WebSocketEventsService;
  private wsServer: any = null; // Will be set by WebSocket server
  private cacheService: any = null; // Redis cache for event deduplication (initialized later)
  private filteringService: NotificationFilteringService;

  private constructor() {
    this.filteringService = new NotificationFilteringService();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): WebSocketEventsService {
    if (!WebSocketEventsService.instance) {
      WebSocketEventsService.instance = new WebSocketEventsService();
    }
    return WebSocketEventsService.instance;
  }

  /**
   * Set WebSocket server instance
   */
  public setWebSocketServer(wsServer: any): void {
    this.wsServer = wsServer;
    logger.info('WebSocket server instance set in events service', {
      component: 'WebSocketEventsService'
    });
    
    // Initialize Redis cache connection
    this.initializeCache();
  }

  /**
   * Initialize Redis cache connection
   */
  private async initializeCache(): Promise<void> {
    try {
      // Get or create cache service instance
      if (!this.cacheService) {
        this.cacheService = getRedisCacheService();
      }
      
      if (!this.cacheService.isReady()) {
        await this.cacheService.connect();
        logger.info('Redis cache connected for WebSocket events', {
          component: 'WebSocketEventsService'
        });
      }
    } catch (error) {
      logger.warn('Failed to connect Redis cache for WebSocket events', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Disconnect Redis cache
   */
  public async disconnectCache(): Promise<void> {
    try {
      if (this.cacheService) {
        await this.cacheService.disconnect();
        logger.info('Redis cache disconnected from WebSocket events', {
          component: 'WebSocketEventsService'
        });
      }
    } catch (error) {
      logger.warn('Failed to disconnect Redis cache', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Check if WebSocket server is available
   */
  private isWebSocketAvailable(): boolean {
    return this.wsServer !== null;
  }

  /**
   * Emit like event to relevant users
   */
  public async emitLikeEvent(
    contentType: 'video' | 'post',
    contentId: string,
    authorId: string,
    likerId: string,
    likerUsername: string,
    isLiked: boolean,
    totalLikes: number
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for like event', {
        component: 'WebSocketEventsService',
        contentType,
        contentId,
        likerId
      });
      return;
    }

    try {
      // Event deduplication using Redis cache
      const eventId = `like:${contentType}:${contentId}:${likerId}:${Date.now()}`;
      const eventData = {
        contentType,
        contentId,
        authorId,
        likerId,
        likerUsername,
        isLiked,
        totalLikes,
        timestamp: new Date()
      };

      // Try to cache the event (prevents duplicates) - only if cache is available
      let isNewEvent = true;
      if (this.cacheService && this.cacheService.isReady()) {
        isNewEvent = await this.cacheService.cacheEvent(eventId, eventData, 60);
        
        if (!isNewEvent) {
          logger.info('Duplicate like event prevented by cache', {
            component: 'WebSocketEventsService',
            eventId,
            contentType,
            contentId,
            likerId
          });
          return;
        }

        // Increment cache hit counter for performance monitoring
        await this.cacheService.incrementHitCounter('likes');
      }
      const eventPayload: LikeEventPayload = {
        postId: contentId, // Using postId for consistency with existing interface
        userId: likerId,
        username: likerUsername,
        isLiked,
        totalLikes
      };

      // Emit to content author (if they're not the one who liked)
      if (authorId !== likerId) {
        this.wsServer.broadcastToUser(authorId, isLiked ? 'post:liked' : 'post:unliked', eventPayload);
        
        // Send notification to author
        const notification: NotificationPayload = {
          id: `like_${contentId}_${likerId}_${Date.now()}`,
          type: 'like',
          title: isLiked ? 'New Like!' : 'Like Removed',
          message: isLiked 
            ? `${likerUsername} liked your ${contentType}`
            : `${likerUsername} removed their like from your ${contentType}`,
          data: {
            contentType,
            contentId,
            likerId,
            likerUsername,
            totalLikes
          },
          createdAt: new Date(),
          isRead: false
        };
        
        this.wsServer.broadcastToUser(authorId, 'notification:new', notification);
      }

      // Emit like count update to all users viewing this content
      // Using a room-based approach for viewers of specific content
      const contentRoom = `content:${contentType}:${contentId}`;
      this.wsServer.getIOServer().to(contentRoom).emit(isLiked ? 'post:liked' : 'post:unliked', eventPayload);

      // Cache the updated like count for performance - only if cache is available
      if (this.cacheService && this.cacheService.isReady()) {
        await this.cacheService.set(
          `likes:${contentType}:${contentId}:count`,
          totalLikes,
          300 // 5 minutes cache
        );
      }

      logger.info('Like event emitted successfully', {
        component: 'WebSocketEventsService',
        contentType,
        contentId,
        authorId,
        likerId,
        likerUsername,
        isLiked,
        totalLikes,
        notificationSent: authorId !== likerId,
        eventId,
        cached: true
      });

    } catch (error) {
      logger.error('Failed to emit like event', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        contentType,
        contentId,
        likerId
      });
    }
  }

  /**
   * Emit comment event to relevant users
   */
  public async emitCommentEvent(
    commentId: string,
    postId: string,
    authorId: string,
    commenterId: string,
    commenterUsername: string,
    content: string,
    parentCommentId?: string
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for comment event', {
        component: 'WebSocketEventsService',
        commentId,
        postId,
        commenterId
      });
      return;
    }

    try {
      // Event deduplication for comment creation
      const eventId = `comment:${commentId}:create:${Date.now()}`;
      const eventData = {
        commentId,
        postId,
        authorId,
        commenterId,
        commenterUsername,
        content,
        parentCommentId,
        timestamp: new Date()
      };

      // Try to cache the event (prevents duplicates) - only if cache is available
      let isNewEvent = true;
      if (this.cacheService && this.cacheService.isReady()) {
        isNewEvent = await this.cacheService.cacheEvent(eventId, eventData, 60);
        
        if (!isNewEvent) {
          logger.info('Duplicate comment event prevented by cache', {
            component: 'WebSocketEventsService',
            eventId,
            commentId,
            postId,
            commenterId
          });
          return;
        }

        // Increment cache hit counter for performance monitoring
        await this.cacheService.incrementHitCounter('comments');
      }
      const eventPayload: CommentEventPayload = {
        commentId,
        postId,
        userId: commenterId,
        username: commenterUsername,
        content,
        createdAt: new Date(),
        ...(parentCommentId !== undefined && { parentCommentId })
      };

      // Emit to post author (if they're not the commenter)
      if (authorId !== commenterId) {
        this.wsServer.broadcastToUser(authorId, 'comment:created', eventPayload);
      }

      // Emit to all viewers of this post
      const postRoom = `content:post:${postId}`;
      this.wsServer.getIOServer().to(postRoom).emit('comment:created', eventPayload);

      // Invalidate comment cache for this post to ensure fresh data - only if cache is available
      if (this.cacheService && this.cacheService.isReady()) {
        await this.cacheService.invalidateContentCache('post', postId);
      }

      logger.info('Comment event emitted successfully', {
        component: 'WebSocketEventsService',
        commentId,
        postId,
        commenterId,
        commenterUsername,
        eventId,
        cached: true
      });

    } catch (error) {
      logger.error('Failed to emit comment event', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        commentId,
        postId,
        commenterId
      });
    }
  }

  /**
   * Emit comment update event to relevant users
   */
  public async emitCommentUpdateEvent(
    commentId: string,
    postId: string,
    authorId: string,
    commenterId: string,
    commenterUsername: string,
    content: string,
    parentCommentId?: string
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for comment update event', {
        component: 'WebSocketEventsService',
        commentId,
        postId,
        commenterId
      });
      return;
    }

    try {
      const eventPayload: CommentEventPayload = {
        commentId,
        postId,
        userId: commenterId,
        username: commenterUsername,
        content,
        createdAt: new Date(),
        ...(parentCommentId !== undefined && { parentCommentId })
      };

      // Emit to post author (if they're not the commenter)
      if (authorId !== commenterId) {
        this.wsServer.broadcastToUser(authorId, 'comment:updated', eventPayload);
      }

      // Emit to all viewers of this post
      const postRoom = `content:post:${postId}`;
      this.wsServer.getIOServer().to(postRoom).emit('comment:updated', eventPayload);

      logger.info('Comment update event emitted successfully', {
        component: 'WebSocketEventsService',
        commentId,
        postId,
        commenterId,
        commenterUsername
      });

    } catch (error) {
      logger.error('Failed to emit comment update event', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        commentId,
        postId,
        commenterId
      });
    }
  }

  /**
   * Emit comment deletion event to relevant users
   */
  public async emitCommentDeleteEvent(
    commentId: string,
    postId: string,
    authorId: string,
    commenterId: string,
    commenterUsername: string
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for comment delete event', {
        component: 'WebSocketEventsService',
        commentId,
        postId,
        commenterId
      });
      return;
    }

    try {
      const eventPayload = {
        commentId,
        postId
      };

      // Emit to post author (if they're not the commenter)
      if (authorId !== commenterId) {
        this.wsServer.broadcastToUser(authorId, 'comment:deleted', eventPayload);
      }

      // Emit to all viewers of this post
      const postRoom = `content:post:${postId}`;
      this.wsServer.getIOServer().to(postRoom).emit('comment:deleted', eventPayload);

      logger.info('Comment delete event emitted successfully', {
        component: 'WebSocketEventsService',
        commentId,
        postId,
        commenterId,
        commenterUsername
      });

    } catch (error) {
      logger.error('Failed to emit comment delete event', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        commentId,
        postId,
        commenterId
      });
    }
  }

  /**
   * Emit follow event to relevant users
   */
  public async emitFollowEvent(
    followerId: string,
    followerUsername: string,
    followeeId: string,
    followeeUsername: string,
    isFollowing: boolean,
    totalFollowers: number
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for follow event', {
        component: 'WebSocketEventsService',
        followerId,
        followeeId
      });
      return;
    }

    try {
      const eventPayload: FollowEventPayload = {
        followerId,
        followeeId,
        followerUsername,
        followeeUsername,
        isFollowing,
        totalFollowers
      };

      // Emit to the user being followed/unfollowed
      this.wsServer.broadcastToUser(followeeId, isFollowing ? 'user:followed' : 'user:unfollowed', eventPayload);

      // Send notification to the followee
      if (isFollowing) {
        const notification: NotificationPayload = {
          id: `follow_${followerId}_${followeeId}_${Date.now()}`,
          type: 'follow',
          title: 'New Follower!',
          message: `${followerUsername} started following you`,
          data: {
            followerId,
            followerUsername,
            totalFollowers
          },
          createdAt: new Date(),
          isRead: false
        };
        
        this.wsServer.broadcastToUser(followeeId, 'notification:new', notification);
      }

      logger.info('Follow event emitted successfully', {
        component: 'WebSocketEventsService',
        followerId,
        followerUsername,
        followeeId,
        followeeUsername,
        isFollowing,
        totalFollowers
      });

    } catch (error) {
      logger.error('Failed to emit follow event', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        followerId,
        followeeId
      });
    }
  }

  /**
   * Emit general notification to specific user
   */
  public async emitNotification(userId: string, notification: NotificationPayload): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for notification', {
        component: 'WebSocketEventsService',
        userId,
        notificationId: notification.id
      });
      return;
    }

    try {
      // Apply smart filtering before emitting notification
      const filterableNotification = {
        id: notification.id,
        type: notification.type,
        userId: userId,
        data: notification.data,
        timestamp: notification.createdAt
      };

      const filteringDecision = await this.filteringService.shouldSendNotification(filterableNotification);
      
      if (!filteringDecision.allowed) {
        logger.info('Notification filtered', {
          component: 'WebSocketEventsService',
          userId,
          notificationId: notification.id,
          reason: filteringDecision.reason,
          importanceScore: filteringDecision.importanceScore
        });
        
        // If suggested delay, we could implement delayed delivery here
        if (filteringDecision.suggestedDelay) {
          logger.info('Notification suggested for delayed delivery', {
            component: 'WebSocketEventsService',
            userId,
            notificationId: notification.id,
            delayMs: filteringDecision.suggestedDelay
          });
          // TODO: Implement delayed notification queue
        }
        
        return;
      }

      // If batching is suggested, we could implement batching here
      if (filteringDecision.batchWithOthers) {
        logger.info('Notification suggested for batching', {
          component: 'WebSocketEventsService',
          userId,
          notificationId: notification.id,
          importanceScore: filteringDecision.importanceScore
        });
        // TODO: Implement notification batching queue
      }

      this.wsServer.broadcastToUser(userId, 'notification:new', notification);

      logger.info('Notification emitted successfully', {
        component: 'WebSocketEventsService',
        userId,
        notificationId: notification.id,
        notificationType: notification.type,
        importanceScore: filteringDecision.importanceScore,
        filtered: false
      });

    } catch (error) {
      logger.error('Failed to emit notification', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        notificationId: notification.id
      });
    }
  }

  /**
   * Batch emit multiple like events (for performance optimization)
   */
  public async batchEmitLikeEvents(events: Array<{
    contentType: 'video' | 'post';
    contentId: string;
    authorId: string;
    likerId: string;
    likerUsername: string;
    isLiked: boolean;
    totalLikes: number;
  }>): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for batch like events', {
        component: 'WebSocketEventsService',
        eventCount: events.length
      });
      return;
    }

    try {
      // Group events by author to minimize notifications
      const eventsByAuthor = new Map<string, typeof events>();
      
      for (const event of events) {
        if (!eventsByAuthor.has(event.authorId)) {
          eventsByAuthor.set(event.authorId, []);
        }
        eventsByAuthor.get(event.authorId)!.push(event);
      }

      // Process events for each author
      for (const [authorId, authorEvents] of eventsByAuthor) {
        // Send a batched notification to the author
        if (authorEvents.length > 1) {
          const likerNames = authorEvents.map(e => e.likerUsername).slice(0, 3);
          const remainingCount = Math.max(0, authorEvents.length - 3);
          
          const notification: NotificationPayload = {
            id: `batch_likes_${authorId}_${Date.now()}`,
            type: 'like',
            title: 'Multiple Likes!',
            message: remainingCount > 0
              ? `${likerNames.join(', ')} and ${remainingCount} others liked your content`
              : `${likerNames.join(', ')} liked your content`,
            data: {
              eventCount: authorEvents.length,
              events: authorEvents
            },
            createdAt: new Date(),
            isRead: false
          };
          
          this.wsServer.broadcastToUser(authorId, 'notification:new', notification);
        } else {
          // Single event, emit normally
          await this.emitLikeEvent(
            authorEvents[0].contentType,
            authorEvents[0].contentId,
            authorEvents[0].authorId,
            authorEvents[0].likerId,
            authorEvents[0].likerUsername,
            authorEvents[0].isLiked,
            authorEvents[0].totalLikes
          );
        }
      }

      logger.info('Batch like events emitted successfully', {
        component: 'WebSocketEventsService',
        totalEvents: events.length,
        authorCount: eventsByAuthor.size
      });

    } catch (error) {
      logger.error('Failed to emit batch like events', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        eventCount: events.length
      });
    }
  }

  /**
   * Emit feed update to specific users
   */
  public async emitFeedUpdate(userIds: string[], feedUpdate: FeedUpdatePayload): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for feed update', {
        component: 'WebSocketEventsService',
        userCount: userIds.length,
        postId: feedUpdate.postId
      });
      return;
    }

    try {
      for (const userId of userIds) {
        this.wsServer.broadcastToUser(userId, 'feed:update', feedUpdate);
      }

      logger.info('Feed update emitted successfully', {
        component: 'WebSocketEventsService',
        userCount: userIds.length,
        postId: feedUpdate.postId,
        updateType: feedUpdate.type
      });

    } catch (error) {
      logger.error('Failed to emit feed update', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userCount: userIds.length,
        postId: feedUpdate.postId
      });
    }
  }

  /**
   * Emit batch feed updates to specific users
   */
  public async batchEmitFeedUpdates(
    userIds: string[], 
    feedUpdates: FeedUpdatePayload | FeedUpdatePayload[]
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for batch feed updates', {
        component: 'WebSocketEventsService',
        userCount: userIds.length
      });
      return;
    }

    try {
      const updates = Array.isArray(feedUpdates) ? feedUpdates : [feedUpdates];
      
      for (const userId of userIds) {
        if (updates.length === 1) {
          this.wsServer.broadcastToUser(userId, 'feed:update', updates[0]);
        } else {
          this.wsServer.broadcastToUser(userId, 'feed:batch_update', updates);
        }
      }

      logger.info('Batch feed updates emitted successfully', {
        component: 'WebSocketEventsService',
        userCount: userIds.length,
        updateCount: updates.length
      });

    } catch (error) {
      logger.error('Failed to emit batch feed updates', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userCount: userIds.length
      });
    }
  }

  /**
   * Emit priority feed update to specific users
   */
  public async emitPriorityFeedUpdate(
    userIds: string[], 
    feedUpdate: PriorityFeedUpdatePayload,
    priority: 'low' | 'normal' | 'high'
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for priority feed update', {
        component: 'WebSocketEventsService',
        userCount: userIds.length,
        priority
      });
      return;
    }

    try {
      const priorityUpdate = { ...feedUpdate, priority };
      
      for (const userId of userIds) {
        this.wsServer.broadcastToUser(userId, 'feed:priority_update', priorityUpdate);
      }

      logger.info('Priority feed update emitted successfully', {
        component: 'WebSocketEventsService',
        userCount: userIds.length,
        postId: feedUpdate.postId,
        priority
      });

    } catch (error) {
      logger.error('Failed to emit priority feed update', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userCount: userIds.length,
        priority
      });
    }
  }

  /**
   * Emit instant feed refresh to specific users
   */
  public async emitInstantFeedRefresh(
    userIds: string[], 
    feedUpdate: FeedUpdatePayload
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for instant feed refresh', {
        component: 'WebSocketEventsService',
        userCount: userIds.length
      });
      return;
    }

    try {
      for (const userId of userIds) {
        this.wsServer.broadcastToUser(userId, 'feed:instant_refresh', feedUpdate);
      }

      logger.info('Instant feed refresh emitted successfully', {
        component: 'WebSocketEventsService',
        userCount: userIds.length,
        postId: feedUpdate.postId
      });

    } catch (error) {
      logger.error('Failed to emit instant feed refresh', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userCount: userIds.length
      });
    }
  }

  /**
   * Emit personalized feed update to specific user
   */
  public async emitPersonalizedFeedUpdate(
    userId: string, 
    feedUpdate: FeedUpdatePayload
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for personalized feed update', {
        component: 'WebSocketEventsService',
        userId
      });
      return;
    }

    try {
      this.wsServer.broadcastToUser(userId, 'feed:personalized_update', feedUpdate);

      logger.info('Personalized feed update emitted successfully', {
        component: 'WebSocketEventsService',
        userId,
        postId: feedUpdate.postId,
        personalizedScore: feedUpdate.personalizedScore
      });

    } catch (error) {
      logger.error('Failed to emit personalized feed update', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
    }
  }

  /**
   * Emit user presence update to relevant users (followers)
   */
  public async emitUserPresenceUpdate(
    followerIds: string[], 
    presencePayload: UserPresencePayload
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for user presence update', {
        component: 'WebSocketEventsService',
        userId: presencePayload.userId,
        status: presencePayload.status,
        followerCount: followerIds.length
      });
      return;
    }

    try {
      const eventName = presencePayload.status === 'online' ? 'user:online' : 'user:offline';
      
      // Use Promise.allSettled to handle individual broadcast failures gracefully
      const broadcastPromises = followerIds.map(async (followerId) => {
        try {
          await this.wsServer.broadcastToUser(followerId, eventName, presencePayload);
        } catch (error) {
          logger.warn('Failed to broadcast to individual follower', {
            component: 'WebSocketEventsService',
            followerId,
            userId: presencePayload.userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      await Promise.allSettled(broadcastPromises);

      logger.info('User presence update emitted successfully', {
        component: 'WebSocketEventsService',
        userId: presencePayload.userId,
        username: presencePayload.username,
        status: presencePayload.status,
        followerCount: followerIds.length,
        hasLastSeen: !!presencePayload.lastSeen
      });

    } catch (error) {
      logger.error('Failed to emit user presence update', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: presencePayload.userId,
        status: presencePayload.status,
        followerCount: followerIds.length
      });
    }
  }

  /**
   * Emit bulk presence updates for multiple users
   */
  public async emitBulkPresenceUpdate(
    targetUserIds: string[],
    presenceUpdates: UserPresencePayload[]
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for bulk presence update', {
        component: 'WebSocketEventsService',
        targetUserCount: targetUserIds.length,
        updateCount: presenceUpdates.length
      });
      return;
    }

    try {
      // Use Promise.allSettled to handle individual broadcast failures gracefully
      const broadcastPromises = targetUserIds.map(async (userId) => {
        try {
          await this.wsServer.broadcastToUser(userId, 'user:bulk_presence', presenceUpdates);
        } catch (error) {
          logger.warn('Failed to broadcast bulk presence to individual user', {
            component: 'WebSocketEventsService',
            userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      await Promise.allSettled(broadcastPromises);

      logger.info('Bulk presence update emitted successfully', {
        component: 'WebSocketEventsService',
        targetUserCount: targetUserIds.length,
        updateCount: presenceUpdates.length
      });

    } catch (error) {
      logger.error('Failed to emit bulk presence update', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        targetUserCount: targetUserIds.length,
        updateCount: presenceUpdates.length
      });
    }
  }

  /**
   * Emit user activity status to relevant users
   */
  public async emitUserActivityStatus(
    followerIds: string[],
    activityPayload: UserActivityPayload
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for user activity status', {
        component: 'WebSocketEventsService',
        userId: activityPayload.userId,
        activity: activityPayload.activity,
        followerCount: followerIds.length
      });
      return;
    }

    try {
      // Use Promise.allSettled to handle individual broadcast failures gracefully
      const broadcastPromises = followerIds.map(async (followerId) => {
        try {
          await this.wsServer.broadcastToUser(followerId, 'user:activity', activityPayload);
        } catch (error) {
          logger.warn('Failed to broadcast activity to individual follower', {
            component: 'WebSocketEventsService',
            followerId,
            userId: activityPayload.userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      await Promise.allSettled(broadcastPromises);

      logger.info('User activity status emitted successfully', {
        component: 'WebSocketEventsService',
        userId: activityPayload.userId,
        username: activityPayload.username,
        activity: activityPayload.activity,
        followerCount: followerIds.length,
        contentId: activityPayload.contentId
      });

    } catch (error) {
      logger.error('Failed to emit user activity status', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: activityPayload.userId,
        activity: activityPayload.activity,
        followerCount: followerIds.length
      });
    }
  }

  /**
   * Emit presence-related notification to specific user
   */
  public async emitPresenceNotification(userId: string, notification: NotificationPayload): Promise<void> {
    return this.emitNotification(userId, notification);
  }

  /**
   * Emit batch presence notifications to multiple users
   */
  public async emitBatchPresenceNotifications(
    userIds: string[], 
    notifications: NotificationPayload[]
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for batch presence notifications', {
        component: 'WebSocketEventsService',
        userCount: userIds.length,
        notificationCount: notifications.length
      });
      return;
    }

    try {
      for (const userId of userIds) {
        this.wsServer.broadcastToUser(userId, 'notification:batch', notifications);
      }

      logger.info('Batch presence notifications emitted successfully', {
        component: 'WebSocketEventsService',
        userCount: userIds.length,
        notificationCount: notifications.length
      });

    } catch (error) {
      logger.error('Failed to emit batch presence notifications', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userCount: userIds.length,
        notificationCount: notifications.length
      });
    }
  }

  /**
   * Emit trending content update to specific users
   */
  public async emitTrendingContentUpdate(
    userIds: string[], 
    trendingContent: any
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for trending content update', {
        component: 'WebSocketEventsService',
        userCount: userIds.length
      });
      return;
    }

    try {
      // Use Promise.allSettled to handle individual broadcast failures gracefully
      const broadcastPromises = userIds.map(async (userId) => {
        try {
          await this.wsServer.broadcastToUser(userId, 'recommendation:trending_content', trendingContent);
        } catch (error) {
          logger.warn('Failed to broadcast trending content to individual user', {
            component: 'WebSocketEventsService',
            userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      await Promise.allSettled(broadcastPromises);

      logger.info('Trending content update emitted successfully', {
        component: 'WebSocketEventsService',
        userCount: userIds.length,
        postId: trendingContent.postId,
        engagementScore: trendingContent.engagementScore
      });

    } catch (error) {
      logger.error('Failed to emit trending content update', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userCount: userIds.length
      });
    }
  }

  /**
   * Emit personalized recommendation to specific user
   */
  public async emitRecommendationNotification(
    userId: string, 
    recommendation: any
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for recommendation notification', {
        component: 'WebSocketEventsService',
        userId
      });
      return;
    }

    try {
      this.wsServer.broadcastToUser(userId, 'recommendation:personalized', recommendation);

      logger.info('Recommendation notification emitted successfully', {
        component: 'WebSocketEventsService',
        userId,
        postId: recommendation.postId,
        personalizedScore: recommendation.personalizedScore
      });

    } catch (error) {
      logger.error('Failed to emit recommendation notification', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
    }
  }

  /**
   * Warm cache with popular content for better performance
   */
  public async warmPopularContentCache(
    popularContent: Array<{
      id: string;
      type: 'post' | 'video';
      stats: Record<string, any>;
    }>
  ): Promise<void> {
    try {
      if (this.cacheService && this.cacheService.isReady()) {
        await this.cacheService.warmPopularContent(popularContent, 3600); // Cache for 1 hour
        
        logger.info('Popular content cache warmed', {
          component: 'WebSocketEventsService',
          contentCount: popularContent.length
        });
      }
    } catch (error) {
      logger.error('Failed to warm popular content cache', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Warm user feed cache for active users
   */
  public async warmUserFeedCache(
    userId: string,
    feedData: any
  ): Promise<void> {
    try {
      if (this.cacheService && this.cacheService.isReady()) {
        await this.cacheService.warmUserFeed(userId, feedData, 1800); // Cache for 30 minutes
        
        logger.info('User feed cache warmed', {
          component: 'WebSocketEventsService',
          userId
        });
      }
    } catch (error) {
      logger.error('Failed to warm user feed cache', {
        component: 'WebSocketEventsService',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get cache performance metrics for monitoring
   */
  public async getCacheMetrics(): Promise<any> {
    try {
      if (this.cacheService && this.cacheService.isReady()) {
        const metrics = await this.cacheService.getPerformanceMetrics();
        const stats = await this.cacheService.getCacheStats();
        
        return {
          performance: metrics,
          statistics: stats,
          timestamp: new Date()
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to get cache metrics', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return null;
    }
  }

  /**
   * Clean up expired cache entries for maintenance
   */
  public async performCacheMaintenance(): Promise<void> {
    try {
      if (this.cacheService && this.cacheService.isReady()) {
        // Clean expired event deduplication entries
        const eventsCleaned = await this.cacheService.cleanExpiredKeys('event:*');
        
        // Clean expired feed cache entries
        const feedCleaned = await this.cacheService.cleanExpiredKeys('feed:*');
        
        logger.info('Cache maintenance completed', {
          component: 'WebSocketEventsService',
          eventsCleaned,
          feedCleaned
        });
      }
    } catch (error) {
      logger.error('Cache maintenance failed', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Batch emit recommendations to specific users
   */
  public async batchEmitRecommendations(
    userIds: string[], 
    recommendations: any[]
  ): Promise<void> {
    if (!this.isWebSocketAvailable()) {
      logger.warn('WebSocket server not available for batch recommendations', {
        component: 'WebSocketEventsService',
        userCount: userIds.length,
        recommendationCount: recommendations.length
      });
      return;
    }

    try {
      // Use Promise.allSettled to handle individual broadcast failures gracefully
      const broadcastPromises = userIds.map(async (userId) => {
        try {
          await this.wsServer.broadcastToUser(userId, 'recommendation:batch', recommendations);
        } catch (error) {
          logger.warn('Failed to broadcast batch recommendations to individual user', {
            component: 'WebSocketEventsService',
            userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      await Promise.allSettled(broadcastPromises);

      logger.info('Batch recommendations emitted successfully', {
        component: 'WebSocketEventsService',
        userCount: userIds.length,
        recommendationCount: recommendations.length
      });

    } catch (error) {
      logger.error('Failed to emit batch recommendations', {
        component: 'WebSocketEventsService',
        error: error instanceof Error ? error.message : 'Unknown error',
        userCount: userIds.length,
        recommendationCount: recommendations.length
      });
    }
  }
}

// Export singleton instance
export const webSocketEventsService = WebSocketEventsService.getInstance();