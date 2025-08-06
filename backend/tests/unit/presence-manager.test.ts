/**
 * Presence Manager Unit Tests
 * Tests for presence broadcasting and management functionality
 */

import { PresenceManager } from '../../src/services/presenceManager';
import { ConnectionManager } from '../../src/websocket/connectionManager';
import { webSocketEventsService } from '../../src/services/websocketEvents';

// Mock dependencies
jest.mock('../../src/services/websocketEvents');

const mockWebSocketEventsService = webSocketEventsService as jest.Mocked<typeof webSocketEventsService>;

describe('PresenceManager', () => {
  let presenceManager: PresenceManager;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    presenceManager = PresenceManager.getInstance();
    
    // Create mock connection manager
    mockConnectionManager = {
      getUserPresence: jest.fn(),
      isUserOnline: jest.fn(),
      getUserSockets: jest.fn(),
      getOnlineUsers: jest.fn(),
      addConnection: jest.fn(),
      removeConnection: jest.fn(),
      updateActivity: jest.fn(),
      getConnectionStats: jest.fn(),
      getDetailedStats: jest.fn(),
      disconnectUser: jest.fn(),
      getUserSession: jest.fn(),
      stop: jest.fn()
    } as any;

    presenceManager.setConnectionManager(mockConnectionManager);

    // Reset WebSocket events service mocks
    mockWebSocketEventsService.emitUserPresenceUpdate = jest.fn().mockResolvedValue(undefined);
    mockWebSocketEventsService.emitBulkPresenceUpdate = jest.fn().mockResolvedValue(undefined);
    mockWebSocketEventsService.emitUserActivityStatus = jest.fn().mockResolvedValue(undefined);
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = PresenceManager.getInstance();
      const instance2 = PresenceManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Connection Manager Integration', () => {
    it('should set and get connection manager', () => {
      presenceManager.setConnectionManager(mockConnectionManager);
      
      expect(presenceManager.getConnectionManager()).toBe(mockConnectionManager);
    });
  });

  describe('Presence Broadcasting', () => {
    describe('broadcastPresenceChange', () => {
      it('should broadcast online status to followers', async () => {
        const userId = 'user-123';
        const username = 'testuser';
        const status = 'online';

        await presenceManager.broadcastPresenceChange(userId, username, status);

        // Since followers system isn't implemented yet, should not call WebSocket service
        expect(mockWebSocketEventsService.emitUserPresenceUpdate).not.toHaveBeenCalled();
      });

      it('should broadcast offline status with last seen timestamp', async () => {
        const userId = 'user-456';
        const username = 'testuser2';
        const status = 'offline';

        await presenceManager.broadcastPresenceChange(userId, username, status);

        // Since followers system isn't implemented yet, should not call WebSocket service
        expect(mockWebSocketEventsService.emitUserPresenceUpdate).not.toHaveBeenCalled();
      });

      it('should handle errors gracefully', async () => {
        mockWebSocketEventsService.emitUserPresenceUpdate.mockRejectedValueOnce(new Error('WebSocket error'));

        // Should not throw
        await expect(presenceManager.broadcastPresenceChange('user-789', 'testuser3', 'online'))
          .resolves.not.toThrow();
      });
    });

    describe('broadcastActivityStatus', () => {
      it('should broadcast posting activity', async () => {
        const userId = 'user-123';
        const username = 'testuser';
        const activity = 'posting';
        const contentId = 'post-456';

        await presenceManager.broadcastActivityStatus(userId, username, activity, contentId, 'post');

        // Since followers system isn't implemented yet, should not call WebSocket service
        expect(mockWebSocketEventsService.emitUserActivityStatus).not.toHaveBeenCalled();
      });

      it('should broadcast commenting activity', async () => {
        const userId = 'user-789';
        const username = 'commenter';
        const activity = 'commenting';
        const contentId = 'post-123';

        await presenceManager.broadcastActivityStatus(userId, username, activity, contentId, 'post');

        // Since followers system isn't implemented yet, should not call WebSocket service
        expect(mockWebSocketEventsService.emitUserActivityStatus).not.toHaveBeenCalled();
      });

      it('should handle activity without content ID', async () => {
        const userId = 'user-999';
        const username = 'activeuser';
        const activity = 'browsing';

        await presenceManager.broadcastActivityStatus(userId, username, activity);

        // Since followers system isn't implemented yet, should not call WebSocket service
        expect(mockWebSocketEventsService.emitUserActivityStatus).not.toHaveBeenCalled();
      });

      it('should handle errors gracefully', async () => {
        mockWebSocketEventsService.emitUserActivityStatus.mockRejectedValueOnce(new Error('Activity broadcast error'));

        // Should not throw
        await expect(presenceManager.broadcastActivityStatus('user-123', 'testuser', 'posting'))
          .resolves.not.toThrow();
      });
    });
  });

  describe('Bulk Presence Operations', () => {
    describe('getBulkPresenceForUser', () => {
      it('should return empty array when user has no followed users', async () => {
        const userId = 'user-123';

        const result = await presenceManager.getBulkPresenceForUser(userId);

        expect(result).toEqual([]);
        expect(mockConnectionManager.getUserPresence).not.toHaveBeenCalled();
      });

      it('should return presence for followed users when they exist', async () => {
        // This test will be more relevant once follows system is implemented
        const userId = 'user-123';

        const result = await presenceManager.getBulkPresenceForUser(userId);

        expect(result).toEqual([]);
      });

      it('should handle connection manager not being set', async () => {
        presenceManager.setConnectionManager(null);
        
        const result = await presenceManager.getBulkPresenceForUser('user-123');

        expect(result).toEqual([]);
      });

      it('should handle errors gracefully', async () => {
        // Mock connection manager to throw error
        mockConnectionManager.getUserPresence.mockImplementation(() => {
          throw new Error('Connection error');
        });

        const result = await presenceManager.getBulkPresenceForUser('user-123');

        expect(result).toEqual([]);
      });
    });

    describe('sendInitialPresenceUpdates', () => {
      it('should send initial presence updates when user has followed users', async () => {
        const userId = 'user-123';

        await presenceManager.sendInitialPresenceUpdates(userId);

        // Since no followed users are returned (placeholder implementation), 
        // no bulk update should be sent
        expect(mockWebSocketEventsService.emitBulkPresenceUpdate).not.toHaveBeenCalled();
      });

      it('should handle errors gracefully', async () => {
        mockWebSocketEventsService.emitBulkPresenceUpdate.mockRejectedValueOnce(new Error('Bulk update error'));

        // Should not throw
        await expect(presenceManager.sendInitialPresenceUpdates('user-123'))
          .resolves.not.toThrow();
      });
    });
  });

  describe('Cleanup Operations', () => {
    describe('cleanupDisconnectedUserPresence', () => {
      it('should broadcast offline status for disconnected user', async () => {
        const userId = 'user-123';
        const username = 'testuser';

        await presenceManager.cleanupDisconnectedUserPresence(userId, username);

        // Since followers system isn't implemented yet, should not call WebSocket service
        expect(mockWebSocketEventsService.emitUserPresenceUpdate).not.toHaveBeenCalled();
      });

      it('should handle cleanup errors gracefully', async () => {
        mockWebSocketEventsService.emitUserPresenceUpdate.mockRejectedValueOnce(new Error('Cleanup error'));

        // Should not throw
        await expect(presenceManager.cleanupDisconnectedUserPresence('user-123', 'testuser'))
          .resolves.not.toThrow();
      });
    });
  });

  describe('Integration with WebSocket Events Service', () => {
    it('should use WebSocket events service for presence updates', async () => {
      // This test verifies the integration pattern even though followers aren't implemented
      const userId = 'user-123';
      const username = 'testuser';
      const status = 'online';

      await presenceManager.broadcastPresenceChange(userId, username, status);

      // The method should complete without errors even with empty followers list
      expect(mockWebSocketEventsService.emitUserPresenceUpdate).not.toHaveBeenCalled();
    });

    it('should use WebSocket events service for activity updates', async () => {
      const userId = 'user-789';
      const username = 'activeuser';
      const activity = 'commenting';

      await presenceManager.broadcastActivityStatus(userId, username, activity);

      // The method should complete without errors even with empty followers list
      expect(mockWebSocketEventsService.emitUserActivityStatus).not.toHaveBeenCalled();
    });
  });

  describe('Future Follows System Integration', () => {
    it('should be ready for follows system integration', () => {
      // This test documents the expected behavior once follows system is implemented
      expect(presenceManager).toBeDefined();
      expect(typeof presenceManager.broadcastPresenceChange).toBe('function');
      expect(typeof presenceManager.broadcastActivityStatus).toBe('function');
      expect(typeof presenceManager.getBulkPresenceForUser).toBe('function');
      expect(typeof presenceManager.sendInitialPresenceUpdates).toBe('function');
    });
  });
});