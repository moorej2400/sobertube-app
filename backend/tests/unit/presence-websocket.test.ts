/**
 * WebSocket Presence Broadcasting Tests
 * Tests for real-time user presence and activity notifications
 */

import { WebSocketEventsService } from '../../src/services/websocketEvents';
import { UserPresencePayload } from '../../src/websocket/types';

// Mock WebSocket server
const mockWebSocketServer = {
  broadcastToUser: jest.fn(),
  broadcastToAll: jest.fn(),
  getIOServer: jest.fn(() => ({
    to: jest.fn(() => ({
      emit: jest.fn()
    })),
    emit: jest.fn()
  }))
};

describe('Presence WebSocket Broadcasting', () => {
  let webSocketEventsService: WebSocketEventsService;

  beforeEach(() => {
    jest.clearAllMocks();
    webSocketEventsService = WebSocketEventsService.getInstance();
    webSocketEventsService.setWebSocketServer(mockWebSocketServer);
  });

  describe('User Presence Broadcasting', () => {
    describe('emitUserPresenceUpdate', () => {
      it('should broadcast user online status to relevant users', async () => {
        const presencePayload: UserPresencePayload = {
          userId: 'user-123',
          username: 'testuser',
          status: 'online'
        };

        const followerIds = ['follower-1', 'follower-2', 'follower-3'];

        await webSocketEventsService.emitUserPresenceUpdate(followerIds, presencePayload);

        // Should broadcast to each follower
        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledTimes(3);
        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('follower-1', 'user:online', presencePayload);
        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('follower-2', 'user:online', presencePayload);
        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('follower-3', 'user:online', presencePayload);
      });

      it('should broadcast user offline status with last seen timestamp', async () => {
        const presencePayload: UserPresencePayload = {
          userId: 'user-456',
          username: 'testuser2',
          status: 'offline',
          lastSeen: new Date()
        };

        const followerIds = ['follower-1'];

        await webSocketEventsService.emitUserPresenceUpdate(followerIds, presencePayload);

        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('follower-1', 'user:offline', presencePayload);
      });

      it('should handle empty follower list gracefully', async () => {
        const presencePayload: UserPresencePayload = {
          userId: 'user-789',
          username: 'testuser3',
          status: 'online'
        };

        await webSocketEventsService.emitUserPresenceUpdate([], presencePayload);

        expect(mockWebSocketServer.broadcastToUser).not.toHaveBeenCalled();
      });

      it('should continue successfully even if WebSocket is unavailable', async () => {
        // Create a service instance without WebSocket server
        const isolatedService = WebSocketEventsService.getInstance();
        // Reset WebSocket server to null to simulate unavailable state
        isolatedService.setWebSocketServer(null);

        const presencePayload: UserPresencePayload = {
          userId: 'user-123',
          username: 'testuser',
          status: 'online'
        };

        // Should not throw, but gracefully handle unavailable WebSocket
        await expect(isolatedService.emitUserPresenceUpdate(['follower-1'], presencePayload))
          .resolves.not.toThrow();

        // Restore WebSocket server for other tests
        isolatedService.setWebSocketServer(mockWebSocketServer);
      });
    });

    describe('emitBulkPresenceUpdate', () => {
      it('should efficiently broadcast presence updates for multiple users', async () => {
        const presenceUpdates = [
          {
            userId: 'user-1',
            username: 'user1',
            status: 'online' as const
          },
          {
            userId: 'user-2',
            username: 'user2',
            status: 'offline' as const,
            lastSeen: new Date()
          }
        ];

        const targetUserIds = ['target-1', 'target-2'];

        await webSocketEventsService.emitBulkPresenceUpdate(targetUserIds, presenceUpdates);

        // Should send bulk update to each target user
        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledTimes(2);
        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('target-1', 'user:bulk_presence', presenceUpdates);
        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('target-2', 'user:bulk_presence', presenceUpdates);
      });
    });
  });

  describe('Activity Status Broadcasting', () => {
    describe('emitUserActivityStatus', () => {
      it('should broadcast user activity status (posting)', async () => {
        const activityPayload = {
          userId: 'user-123',
          username: 'testuser',
          activity: 'posting' as const,
          timestamp: new Date(),
          contentId: 'post-456'
        };

        const followerIds = ['follower-1', 'follower-2'];

        await webSocketEventsService.emitUserActivityStatus(followerIds, activityPayload);

        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledTimes(2);
        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('follower-1', 'user:activity', activityPayload);
        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('follower-2', 'user:activity', activityPayload);
      });

      it('should broadcast user activity status (commenting)', async () => {
        const activityPayload = {
          userId: 'user-789',
          username: 'commenter',
          activity: 'commenting' as const,
          timestamp: new Date(),
          contentId: 'post-123'
        };

        await webSocketEventsService.emitUserActivityStatus(['follower-1'], activityPayload);

        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('follower-1', 'user:activity', activityPayload);
      });

      it('should handle activity status without content ID', async () => {
        const activityPayload = {
          userId: 'user-999',
          username: 'activeuser',
          activity: 'browsing' as const,
          timestamp: new Date()
        };

        await webSocketEventsService.emitUserActivityStatus(['follower-1'], activityPayload);

        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('follower-1', 'user:activity', activityPayload);
      });
    });
  });

  describe('Presence-based Notifications', () => {
    describe('emitPresenceNotification', () => {
      it('should send notification when followed user comes online', async () => {
        const notification = {
          id: 'notif-123',
          type: 'presence' as const,
          title: 'User Online',
          message: 'testuser is now online',
          data: {
            userId: 'user-123',
            username: 'testuser',
            status: 'online'
          },
          createdAt: new Date(),
          isRead: false
        };

        await webSocketEventsService.emitPresenceNotification('follower-1', notification);

        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('follower-1', 'notification:new', notification);
      });

      it('should handle batch presence notifications', async () => {
        const notifications = [
          {
            id: 'notif-1',
            type: 'presence' as const,
            title: 'Users Online',
            message: '3 users you follow are now online',
            data: { count: 3 },
            createdAt: new Date(),
            isRead: false
          }
        ];

        const userIds = ['user-1', 'user-2'];

        await webSocketEventsService.emitBatchPresenceNotifications(userIds, notifications);

        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledTimes(2);
        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('user-1', 'notification:batch', notifications);
        expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('user-2', 'notification:batch', notifications);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket broadcasting errors gracefully', async () => {
      // Mock WebSocket server to throw error
      mockWebSocketServer.broadcastToUser.mockRejectedValueOnce(new Error('WebSocket error'));

      const presencePayload: UserPresencePayload = {
        userId: 'user-123',
        username: 'testuser',
        status: 'online'
      };

      // Should not throw, but handle error gracefully
      await expect(webSocketEventsService.emitUserPresenceUpdate(['follower-1'], presencePayload))
        .resolves.not.toThrow();

      expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalledWith('follower-1', 'user:online', presencePayload);
    });

    it('should log errors appropriately', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      mockWebSocketServer.broadcastToUser.mockRejectedValueOnce(new Error('Network failure'));

      const presencePayload: UserPresencePayload = {
        userId: 'user-456',
        username: 'testuser',
        status: 'offline',
        lastSeen: new Date()
      };

      await webSocketEventsService.emitUserPresenceUpdate(['follower-1'], presencePayload);

      // Should continue execution despite error
      expect(mockWebSocketServer.broadcastToUser).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});