/**
 * Connection Manager Unit Tests
 * Tests for user presence and activity tracking functionality
 */

import { ConnectionManager } from '../../src/websocket/connectionManager';

describe('ConnectionManager', () => {
  let connectionManager: ConnectionManager;

  beforeEach(() => {
    connectionManager = new ConnectionManager();
  });

  afterEach(() => {
    connectionManager.stop();
  });

  describe('User Presence Tracking', () => {
    describe('addConnection', () => {
      it('should register a new user connection and mark user as online', () => {
        const socketId = 'socket-123';
        const userId = 'user-456';
        const username = 'testuser';

        connectionManager.addConnection(socketId, userId, username);

        expect(connectionManager.isUserOnline(userId)).toBe(true);
        expect(connectionManager.getUserSockets(userId)).toContain(socketId);
        
        const presence = connectionManager.getUserPresence(userId);
        expect(presence).not.toBeNull();
        expect(presence!.userId).toBe(userId);
        expect(presence!.username).toBe(username);
        expect(presence!.status).toBe('online');
        expect(presence!.lastSeen).toBeUndefined();
      });

      it('should handle multiple connections for the same user', () => {
        const socketId1 = 'socket-123';
        const socketId2 = 'socket-456';
        const userId = 'user-789';
        const username = 'testuser';

        connectionManager.addConnection(socketId1, userId, username);
        connectionManager.addConnection(socketId2, userId, username);

        expect(connectionManager.isUserOnline(userId)).toBe(true);
        expect(connectionManager.getUserSockets(userId)).toHaveLength(2);
        expect(connectionManager.getUserSockets(userId)).toContain(socketId1);
        expect(connectionManager.getUserSockets(userId)).toContain(socketId2);

        const session = connectionManager.getUserSession(userId);
        expect(session).toBeDefined();
        expect(session!.reconnectCount).toBe(1); // Second connection is a reconnection
      });
    });

    describe('removeConnection', () => {
      it('should mark user as offline when all connections are removed', () => {
        const socketId = 'socket-123';
        const userId = 'user-456';
        const username = 'testuser';

        connectionManager.addConnection(socketId, userId, username);
        expect(connectionManager.isUserOnline(userId)).toBe(true);

        const removed = connectionManager.removeConnection(socketId);
        expect(removed).toBe(true);
        expect(connectionManager.isUserOnline(userId)).toBe(false);

        const presence = connectionManager.getUserPresence(userId);
        expect(presence).not.toBeNull();
        expect(presence!.status).toBe('offline');
        expect(presence!.lastSeen).toBeDefined();
      });

      it('should keep user online if they have remaining connections', () => {
        const socketId1 = 'socket-123';
        const socketId2 = 'socket-456';
        const userId = 'user-789';
        const username = 'testuser';

        connectionManager.addConnection(socketId1, userId, username);
        connectionManager.addConnection(socketId2, userId, username);

        const removed = connectionManager.removeConnection(socketId1);
        expect(removed).toBe(true);
        expect(connectionManager.isUserOnline(userId)).toBe(true);
        expect(connectionManager.getUserSockets(userId)).toHaveLength(1);
        expect(connectionManager.getUserSockets(userId)).toContain(socketId2);
      });

      it('should return false for non-existent connection', () => {
        const removed = connectionManager.removeConnection('non-existent');
        expect(removed).toBe(false);
      });
    });

    describe('updateActivity', () => {
      it('should update last activity timestamp', async () => {
        const socketId = 'socket-123';
        const userId = 'user-456';
        const username = 'testuser';

        connectionManager.addConnection(socketId, userId, username);
        
        const initialSession = connectionManager.getUserSession(userId);
        const initialActivity = initialSession!.lastActivity;

        // Wait a small amount to ensure timestamp difference
        await new Promise(resolve => setTimeout(resolve, 10));
        
        connectionManager.updateActivity(socketId);
        
        const updatedSession = connectionManager.getUserSession(userId);
        expect(updatedSession!.lastActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
      });

      it('should not fail for non-existent socket', () => {
        expect(() => {
          connectionManager.updateActivity('non-existent');
        }).not.toThrow();
      });
    });
  });

  describe('Presence Information', () => {
    describe('getOnlineUsers', () => {
      it('should return list of online users', () => {
        const user1 = 'user-123';
        const user2 = 'user-456';

        connectionManager.addConnection('socket-1', user1, 'user1');
        connectionManager.addConnection('socket-2', user2, 'user2');

        const onlineUsers = connectionManager.getOnlineUsers();
        expect(onlineUsers).toHaveLength(2);
        expect(onlineUsers).toContain(user1);
        expect(onlineUsers).toContain(user2);
      });

      it('should return empty array when no users online', () => {
        const onlineUsers = connectionManager.getOnlineUsers();
        expect(onlineUsers).toHaveLength(0);
      });
    });

    describe('getUserPresence', () => {
      it('should return null for non-existent user', () => {
        const presence = connectionManager.getUserPresence('non-existent');
        expect(presence).toBeNull();
      });

      it('should return complete presence info for online user', () => {
        const socketId = 'socket-123';
        const userId = 'user-456';
        const username = 'testuser';

        connectionManager.addConnection(socketId, userId, username);

        const presence = connectionManager.getUserPresence(userId);
        expect(presence).toMatchObject({
          userId,
          username,
          status: 'online'
        });
        expect(presence!.lastSeen).toBeUndefined();
      });

      it('should return complete presence info for offline user', () => {
        const socketId = 'socket-123';
        const userId = 'user-456';
        const username = 'testuser';

        connectionManager.addConnection(socketId, userId, username);
        connectionManager.removeConnection(socketId);

        const presence = connectionManager.getUserPresence(userId);
        expect(presence).toMatchObject({
          userId,
          username,
          status: 'offline'
        });
        expect(presence!.lastSeen).toBeDefined();
      });
    });
  });

  describe('Connection Statistics', () => {
    describe('getConnectionStats', () => {
      it('should return correct statistics', () => {
        connectionManager.addConnection('socket-1', 'user-1', 'username1');
        connectionManager.addConnection('socket-2', 'user-2', 'username2');
        connectionManager.addConnection('socket-3', 'user-1', 'username1'); // Second socket for user-1

        const stats = connectionManager.getConnectionStats();
        
        expect(stats.totalConnections).toBe(3);
        expect(stats.totalUsers).toBe(2);
        expect(stats.onlineUsers).toBe(2);
        expect(stats.offlineUsers).toBe(0);
        expect(stats.avgSocketsPerUser).toBe(1.5); // 3 sockets / 2 users
        expect(stats.sessionsWithMultipleSockets).toBe(1); // Only user-1 has multiple sockets
      });

      it('should handle empty state', () => {
        const stats = connectionManager.getConnectionStats();
        
        expect(stats.totalConnections).toBe(0);
        expect(stats.totalUsers).toBe(0);
        expect(stats.onlineUsers).toBe(0);
        expect(stats.offlineUsers).toBe(0);
        expect(stats.avgSocketsPerUser).toBe(0);
        expect(stats.sessionsWithMultipleSockets).toBe(0);
      });
    });

    describe('getDetailedStats', () => {
      it('should return detailed session information', () => {
        connectionManager.addConnection('socket-1', 'user-1', 'username1');
        
        const detailedStats = connectionManager.getDetailedStats();
        
        expect(detailedStats.sessions).toHaveLength(1);
        expect(detailedStats.sessions[0]).toMatchObject({
          userId: 'user-1',
          username: 'username1',
          isOnline: true,
          socketCount: 1,
          reconnectCount: 0
        });
        expect(detailedStats.sessions[0].totalConnectionTime).toBeDefined();
        expect(detailedStats.sessions[0].lastActivity).toBeDefined();
        expect(detailedStats.sessions[0].firstConnectedAt).toBeDefined();
        expect(detailedStats.timestamp).toBeDefined();
      });
    });
  });

  describe('User Disconnection', () => {
    describe('disconnectUser', () => {
      it('should disconnect all user sessions', () => {
        const socketId1 = 'socket-123';
        const socketId2 = 'socket-456';
        const userId = 'user-789';
        const username = 'testuser';

        connectionManager.addConnection(socketId1, userId, username);
        connectionManager.addConnection(socketId2, userId, username);

        expect(connectionManager.isUserOnline(userId)).toBe(true);
        expect(connectionManager.getUserSockets(userId)).toHaveLength(2);

        const disconnectedSockets = connectionManager.disconnectUser(userId);
        
        expect(disconnectedSockets).toHaveLength(2);
        expect(disconnectedSockets).toContain(socketId1);
        expect(disconnectedSockets).toContain(socketId2);
        expect(connectionManager.isUserOnline(userId)).toBe(false);
        expect(connectionManager.getUserSockets(userId)).toHaveLength(0);
      });

      it('should return empty array for non-existent user', () => {
        const disconnectedSockets = connectionManager.disconnectUser('non-existent');
        expect(disconnectedSockets).toHaveLength(0);
      });
    });
  });
});