/**
 * Presence Manager Service
 * Manages user presence broadcasting and integration with follows system
 */

import { logger } from '../utils/logger';
import { webSocketEventsService } from './websocketEvents';
import { ConnectionManager } from '../websocket/connectionManager';
import { UserPresencePayload, UserActivityPayload } from '../websocket/types';

export class PresenceManager {
  private static instance: PresenceManager;
  private connectionManager: ConnectionManager | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): PresenceManager {
    if (!PresenceManager.instance) {
      PresenceManager.instance = new PresenceManager();
    }
    return PresenceManager.instance;
  }

  /**
   * Set connection manager instance
   */
  public setConnectionManager(connectionManager: ConnectionManager | null): void {
    this.connectionManager = connectionManager;
  }

  /**
   * Broadcast user presence change to followers
   */
  public async broadcastPresenceChange(
    userId: string, 
    username: string, 
    status: 'online' | 'offline'
  ): Promise<void> {
    try {
      // Get user's followers (placeholder - will integrate with follows system later)
      const followerIds = await this.getUserFollowers(userId);

      if (followerIds.length === 0) {
        logger.debug('No followers to notify for presence change', {
          component: 'PresenceManager',
          userId,
          username,
          status
        });
        return;
      }

      // Create presence payload
      const presencePayload: UserPresencePayload = {
        userId,
        username,
        status,
        ...(status === 'offline' ? { lastSeen: new Date() } : {})
      };

      // Broadcast to followers
      await webSocketEventsService.emitUserPresenceUpdate(followerIds, presencePayload);

      logger.info('User presence change broadcasted successfully', {
        component: 'PresenceManager',
        userId,
        username,
        status,
        followerCount: followerIds.length
      });

    } catch (error) {
      logger.error('Failed to broadcast presence change', {
        component: 'PresenceManager',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        username,
        status
      });
    }
  }

  /**
   * Broadcast user activity status to followers
   */
  public async broadcastActivityStatus(
    userId: string,
    username: string,
    activity: UserActivityPayload['activity'],
    contentId?: string,
    contentType?: 'video' | 'post'
  ): Promise<void> {
    try {
      // Get user's followers
      const followerIds = await this.getUserFollowers(userId);

      if (followerIds.length === 0) {
        return; // No followers to notify
      }

      // Create activity payload
      const activityPayload: UserActivityPayload = {
        userId,
        username,
        activity,
        timestamp: new Date(),
        ...(contentId && { contentId }),
        ...(contentType && { contentType })
      };

      // Broadcast to followers
      await webSocketEventsService.emitUserActivityStatus(followerIds, activityPayload);

      logger.info('User activity status broadcasted successfully', {
        component: 'PresenceManager',
        userId,
        username,
        activity,
        contentId,
        followerCount: followerIds.length
      });

    } catch (error) {
      logger.error('Failed to broadcast activity status', {
        component: 'PresenceManager',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        username,
        activity
      });
    }
  }

  /**
   * Get bulk presence updates for a user's followed users
   */
  public async getBulkPresenceForUser(userId: string): Promise<UserPresencePayload[]> {
    try {
      // Get users that this user follows
      const followedUserIds = await this.getUserFollowing(userId);

      if (followedUserIds.length === 0) {
        return [];
      }

      const presenceUpdates: UserPresencePayload[] = [];

      // Get presence for each followed user
      for (const followedUserId of followedUserIds) {
        if (!this.connectionManager) {
          continue;
        }

        const presence = this.connectionManager.getUserPresence(followedUserId);
        if (presence) {
          presenceUpdates.push(presence);
        }
      }

      logger.debug('Retrieved bulk presence updates', {
        component: 'PresenceManager',
        userId,
        followedUserCount: followedUserIds.length,
        presenceUpdateCount: presenceUpdates.length
      });

      return presenceUpdates;

    } catch (error) {
      logger.error('Failed to get bulk presence for user', {
        component: 'PresenceManager',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return [];
    }
  }

  /**
   * Send initial presence updates when user connects
   */
  public async sendInitialPresenceUpdates(userId: string): Promise<void> {
    try {
      // Get presence updates for users this user follows
      const presenceUpdates = await this.getBulkPresenceForUser(userId);

      if (presenceUpdates.length > 0) {
        await webSocketEventsService.emitBulkPresenceUpdate([userId], presenceUpdates);

        logger.info('Initial presence updates sent to user', {
          component: 'PresenceManager',
          userId,
          updateCount: presenceUpdates.length
        });
      }

    } catch (error) {
      logger.error('Failed to send initial presence updates', {
        component: 'PresenceManager',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
    }
  }

  /**
   * Get user's followers (placeholder implementation)
   * TODO: Replace with actual database query when follows system is implemented
   */
  private async getUserFollowers(userId: string): Promise<string[]> {
    // Placeholder implementation - return empty array for now
    // This will be replaced with actual database query to get user's followers
    logger.debug('Getting user followers (placeholder)', {
      component: 'PresenceManager',
      userId,
      note: 'Placeholder implementation - follows system not yet implemented'
    });
    
    return [];
  }

  /**
   * Get users that this user follows (placeholder implementation)  
   * TODO: Replace with actual database query when follows system is implemented
   */
  private async getUserFollowing(userId: string): Promise<string[]> {
    // Placeholder implementation - return empty array for now
    // This will be replaced with actual database query to get users this user follows
    logger.debug('Getting user following (placeholder)', {
      component: 'PresenceManager',
      userId,
      note: 'Placeholder implementation - follows system not yet implemented'
    });
    
    return [];
  }

  /**
   * Clean up presence data for disconnected users
   */
  public async cleanupDisconnectedUserPresence(userId: string, username: string): Promise<void> {
    try {
      // Broadcast offline status
      await this.broadcastPresenceChange(userId, username, 'offline');

      logger.info('Cleanup completed for disconnected user', {
        component: 'PresenceManager',
        userId,
        username
      });

    } catch (error) {
      logger.error('Failed to cleanup disconnected user presence', {
        component: 'PresenceManager',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        username
      });
    }
  }

  /**
   * Get connection manager instance
   */
  public getConnectionManager(): ConnectionManager | null {
    return this.connectionManager;
  }
}

// Export singleton instance
export const presenceManager = PresenceManager.getInstance();