/**
 * Comprehensive WebSocket Integration Tests
 * Testing complete real-time WebSocket infrastructure for Timeline/Feed System
 * 
 * This test suite covers:
 * - WebSocket connection testing framework
 * - Real-time event testing scenarios  
 * - Load testing for WebSocket connections
 * - Authentication testing for WebSocket
 * - Error handling tests
 * - Performance benchmarking tests
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import * as io from 'socket.io-client';

type ClientSocketType = io.Socket;
import jwt from 'jsonwebtoken';
import { WebSocketServer } from '../../src/websocket/server';
import { ConnectionManager } from '../../src/websocket/connectionManager';
import { webSocketEventsService } from '../../src/services/websocketEvents';
import { config } from '../../src/config';
import { logger } from '../../src/utils/logger';

// Mock Redis client for cache testing
const mockRedisClient = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  isOpen: true,
  isReady: true,
  on: jest.fn(),
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  incr: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  ttl: jest.fn().mockResolvedValue(-1),
  flushall: jest.fn().mockResolvedValue('OK'),
};

// Mock Redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient)
}));

// Mock logger to reduce test noise
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(), 
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock Supabase for database operations
const mockSupabaseClient = {
  from: jest.fn(),
  select: jest.fn(),
  insert: jest.fn(),
  eq: jest.fn(),
  single: jest.fn(),
};

jest.mock('../../src/services/supabase', () => ({
  getSupabaseClient: () => mockSupabaseClient
}));

describe('Comprehensive WebSocket Integration Tests', () => {
  let httpServer: HTTPServer;
  let webSocketServer: WebSocketServer;
  let ioServer: SocketIOServer;
  let clientSockets: ClientSocketType[] = [];
  let port: number;

  beforeAll(async () => {
    // Setup test HTTP server
    httpServer = new HTTPServer();
    
    // Find available port
    port = await new Promise((resolve) => {
      const server = httpServer.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          resolve(address.port);
        }
      });
    });

    // Initialize WebSocket server
    webSocketServer = new WebSocketServer(httpServer, false); // Disable clustering for tests
    ioServer = webSocketServer.getIOServer();
    
    console.log(`Test WebSocket server started on port ${port}`);
  });

  afterAll(async () => {
    // Cleanup all client connections
    await Promise.all(clientSockets.map(socket => 
      new Promise<void>((resolve) => {
        if (socket.connected) {
          socket.disconnect();
          socket.on('disconnect', () => resolve());
        } else {
          resolve();
        }
      })
    ));
    
    // Close servers
    ioServer.close();
    httpServer.close();
    
    console.log('Test servers closed');
  });

  afterEach(async () => {
    // Clear mocks
    jest.clearAllMocks();
    
    // Reset Redis mock state
    mockRedisClient.isReady = true;
    mockRedisClient.isOpen = true;
  });

  describe('WebSocket Connection Testing Framework', () => {
    it('should establish basic WebSocket connection without authentication', async () => {
      const client = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        timeout: 5000
      });
      clientSockets.push(client);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        client.on('connect', () => {
          clearTimeout(timeout);
          expect(client.connected).toBe(true);
          expect(client.id).toBeDefined();
          resolve();
        });

        client.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    it('should establish authenticated WebSocket connection', async () => {
      const userId = 'test-user-123';
      const username = 'testuser';
      const token = jwt.sign({ userId, username }, config.jwtSecret);

      const client = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token },
        timeout: 5000
      });
      clientSockets.push(client);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Authentication timeout'));
        }, 5000);

        client.on('authenticated', (data) => {
          clearTimeout(timeout);
          expect(data.userId).toBe(userId);
          expect(data.username).toBe(username);
          resolve();
        });

        client.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    it('should handle invalid authentication token', async () => {
      const invalidToken = 'invalid.jwt.token';

      const client = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token: invalidToken },
        timeout: 5000
      });
      clientSockets.push(client);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Expected authentication failure'));
        }, 5000);

        client.on('connect', () => {
          // Should still connect but not be authenticated
          expect(client.connected).toBe(true);
          clearTimeout(timeout);
          resolve();
        });

        client.on('unauthenticated', (data) => {
          clearTimeout(timeout);
          expect(data.reason).toBeDefined();
          resolve();
        });
      });
    });

    it('should handle connection rejection due to rate limiting', async () => {
      const userId = 'rate-limited-user';
      const username = 'ratelimiteduser';
      const token = jwt.sign({ userId, username }, config.jwtSecret);

      // Create multiple rapid connections to trigger rate limiting
      const connectionPromises = Array.from({ length: 10 }, async (_, index) => {
        const client = io.io(`http://localhost:${port}`, {
          transports: ['websocket'],
          auth: { token },
          timeout: 2000
        });
        clientSockets.push(client);

        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
            resolve(false); // Timeout means connection failed
          }, 2000);

          client.on('connect', () => {
            clearTimeout(timeout);
            resolve(true);
          });

          client.on('error', (error: any) => {
            clearTimeout(timeout);
            if (error.message?.includes('Rate limit exceeded')) {
              resolve(false); // Rate limited as expected
            } else {
              resolve(false); // Other error
            }
          });

          client.on('connect_error', () => {
            clearTimeout(timeout);
            resolve(false);
          });
        });
      });

      const results = await Promise.all(connectionPromises);
      const successfulConnections = results.filter(result => result).length;
      
      // Should allow some connections but not all due to rate limiting
      expect(successfulConnections).toBeGreaterThan(0);
      expect(successfulConnections).toBeLessThan(10);
    });
  });

  describe('Real-time Event Testing Scenarios', () => {
    let authenticatedClient: ClientSocketType;
    let secondClient: ClientSocketType;
    const userId1 = 'user-123';
    const userId2 = 'user-456';
    const username1 = 'user1';
    const username2 = 'user2';

    beforeEach(async () => {
      // Setup authenticated clients
      const token1 = jwt.sign({ userId: userId1, username: username1 }, config.jwtSecret);
      const token2 = jwt.sign({ userId: userId2, username: username2 }, config.jwtSecret);

      authenticatedClient = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token: token1 }
      });
      clientSockets.push(authenticatedClient);

      secondClient = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token: token2 }
      });
      clientSockets.push(secondClient);

      // Wait for authentication
      await Promise.all([
        new Promise<void>((resolve) => {
          authenticatedClient.on('authenticated', () => resolve());
        }),
        new Promise<void>((resolve) => {
          secondClient.on('authenticated', () => resolve());
        })
      ]);
    });

    it('should broadcast like events to relevant users', async () => {
      const postId = 'test-post-123';
      const contentType = 'post';
      
      // Join content room
      authenticatedClient.emit('join_content', { contentType, contentId: postId });
      secondClient.emit('join_content', { contentType, contentId: postId });

      // Wait for room joining
      await new Promise(resolve => setTimeout(resolve, 100));

      // Setup event listener on second client
      const likeEventPromise = new Promise<any>((resolve) => {
        secondClient.on('post:liked', (data) => resolve(data));
      });

      // Emit like event via WebSocket service
      await webSocketEventsService.emitLikeEvent(
        contentType,
        postId,
        userId2, // Author
        userId1, // Liker
        username1,
        true, // isLiked
        1 // totalLikes
      );

      const likeEvent = await likeEventPromise;
      expect(likeEvent).toMatchObject({
        postId,
        userId: userId1,
        username: username1,
        isLiked: true,
        totalLikes: 1
      });
    });

    it('should broadcast comment events to post viewers', async () => {
      const postId = 'test-post-456';
      const commentId = 'test-comment-123';
      const commentContent = 'This is a test comment';

      // Join content room
      authenticatedClient.emit('join_content', { contentType: 'post', contentId: postId });
      secondClient.emit('join_content', { contentType: 'post', contentId: postId });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Setup event listener
      const commentEventPromise = new Promise<any>((resolve) => {
        secondClient.on('comment:created', (data) => resolve(data));
      });

      // Emit comment event
      await webSocketEventsService.emitCommentEvent(
        commentId,
        postId,
        userId2, // Post author
        userId1, // Commenter
        username1,
        commentContent
      );

      const commentEvent = await commentEventPromise;
      expect(commentEvent).toMatchObject({
        commentId,
        postId,
        userId: userId1,
        username: username1,
        content: commentContent
      });
    });

    it('should broadcast user presence changes to followers', async () => {
      const presencePromise = new Promise<any>((resolve) => {
        secondClient.on('user:online', (data) => resolve(data));
      });

      // Simulate presence change broadcast
      await webSocketEventsService.emitUserPresenceUpdate(
        [userId2], // Followers
        {
          userId: userId1,
          username: username1,
          status: 'online'
        }
      );

      const presenceEvent = await presencePromise;
      expect(presenceEvent).toMatchObject({
        userId: userId1,
        username: username1,
        status: 'online'
      });
    });

    it('should handle feed update broadcasts', async () => {
      const feedUpdatePromise = new Promise<any>((resolve) => {
        authenticatedClient.on('feed:update', (data) => resolve(data));
      });

      const feedUpdate = {
        postId: 'new-post-123',
        authorId: userId2,
        authorUsername: username2,
        content: 'New post content',
        createdAt: new Date(),
        type: 'new_post' as const
      };

      await webSocketEventsService.emitFeedUpdate([userId1], feedUpdate);

      const receivedUpdate = await feedUpdatePromise;
      expect(receivedUpdate).toMatchObject({
        postId: feedUpdate.postId,
        authorId: feedUpdate.authorId,
        type: 'new_post'
      });
    });

    it('should handle recommendation broadcasts', async () => {
      const recommendationPromise = new Promise<any>((resolve) => {
        authenticatedClient.on('recommendation:personalized', (data) => resolve(data));
      });

      const recommendation = {
        postId: 'recommended-post-123',
        authorId: userId2,
        type: 'recommended' as const,
        personalizedScore: 8.5
      };

      await webSocketEventsService.emitRecommendationNotification(userId1, recommendation);

      const receivedRecommendation = await recommendationPromise;
      expect(receivedRecommendation).toMatchObject({
        postId: recommendation.postId,
        type: 'recommended',
        personalizedScore: 8.5
      });
    });
  });

  describe('Load Testing for WebSocket Connections', () => {
    it('should handle multiple simultaneous connections', async () => {
      const connectionCount = 50;
      const connections: ClientSocketType[] = [];

      // Create multiple connections
      const connectionPromises = Array.from({ length: connectionCount }, async (_, index) => {
        const userId = `load-test-user-${index}`;
        const username = `loadtestuser${index}`;
        const token = jwt.sign({ userId, username }, config.jwtSecret);

        const client = io.io(`http://localhost:${port}`, {
          transports: ['websocket'],
          auth: { token },
          timeout: 10000
        });
        connections.push(client);
        clientSockets.push(client);

        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
            resolve(false);
          }, 10000);

          client.on('authenticated', () => {
            clearTimeout(timeout);
            resolve(true);
          });

          client.on('connect_error', () => {
            clearTimeout(timeout);
            resolve(false);
          });
        });
      });

      const results = await Promise.all(connectionPromises);
      const successfulConnections = results.filter(result => result).length;

      expect(successfulConnections).toBeGreaterThan(connectionCount * 0.8); // Allow 20% failure rate

      // Test broadcasting to all connections
      const messageReceived = new Array(successfulConnections).fill(false);
      connections.forEach((client, index) => {
        if (client.connected) {
          client.on('notification:new', () => {
            messageReceived[index] = true;
          });
        }
      });

      // Broadcast to all users
      const notification = {
        id: 'load-test-notification',
        type: 'system' as const,
        title: 'Load Test',
        message: 'This is a load test message',
        data: {},
        createdAt: new Date(),
        isRead: false
      };

      // Broadcast to first few users that are connected
      const connectedUserIds = connections
        .filter(client => client.connected)
        .slice(0, 10)
        .map((_, index) => `load-test-user-${index}`);

      await Promise.all(
        connectedUserIds.map(userId => 
          webSocketEventsService.emitNotification(userId, notification)
        )
      );

      // Wait for message propagation
      await new Promise(resolve => setTimeout(resolve, 1000));

      const receivedCount = messageReceived.slice(0, connectedUserIds.length)
        .filter(received => received).length;
      expect(receivedCount).toBeGreaterThan(0);
    });

    it('should handle rapid event broadcasting without memory leaks', async () => {
      const testUser = 'stress-test-user';
      const token = jwt.sign({ userId: testUser, username: 'stressuser' }, config.jwtSecret);

      const client = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      // Send many rapid events
      const eventCount = 100;
      let receivedEvents = 0;

      client.on('notification:new', () => {
        receivedEvents++;
      });

      // Rapid fire events
      const eventPromises = Array.from({ length: eventCount }, async (_, index) => {
        const notification = {
          id: `stress-test-${index}`,
          type: 'system' as const,
          title: 'Stress Test',
          message: `Message ${index}`,
          data: {},
          createdAt: new Date(),
          isRead: false
        };

        await webSocketEventsService.emitNotification(testUser, notification);
      });

      await Promise.all(eventPromises);

      // Wait for all events to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(receivedEvents).toBeGreaterThan(eventCount * 0.8); // Allow some loss
    });
  });

  describe('Authentication Testing for WebSocket', () => {
    it('should reject connections with expired tokens', async () => {
      const expiredToken = jwt.sign(
        { userId: 'test-user', username: 'testuser', exp: Math.floor(Date.now() / 1000) - 3600 },
        config.jwtSecret
      );

      const client = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token: expiredToken }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Should connect but not be authenticated
          resolve();
        }, 2000);

        client.on('authenticated', () => {
          clearTimeout(timeout);
          fail('Should not authenticate with expired token');
        });

        client.on('connect', () => {
          clearTimeout(timeout);
          resolve(); // Connected but not authenticated
        });
      });
    });

    it('should handle manual authentication after connection', async () => {
      const client = io.io(`http://localhost:${port}`, {
        transports: ['websocket']
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });

      // Manual authentication
      const userId = 'manual-auth-user';
      const username = 'manualauthuser';
      const token = jwt.sign({ userId, username }, config.jwtSecret);

      const authPromise = new Promise<void>((resolve) => {
        client.on('authenticated', (data) => {
          expect(data.userId).toBe(userId);
          expect(data.username).toBe(username);
          resolve();
        });
      });

      client.emit('authenticate', { token });
      await authPromise;
    });

    it('should prevent access to protected features without authentication', async () => {
      const client = io.io(`http://localhost:${port}`, {
        transports: ['websocket']
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });

      const errorPromise = new Promise<any>((resolve) => {
        client.on('error', (error) => resolve(error));
      });

      // Try to request personalized feed without authentication
      client.emit('request_personalized_feed', {});

      const error = await errorPromise;
      expect(error.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle Redis cache failures gracefully', async () => {
      // Simulate Redis failure
      mockRedisClient.isReady = false;
      mockRedisClient.set.mockRejectedValue(new Error('Redis connection lost'));

      const userId = 'cache-error-user';
      const token = jwt.sign({ userId, username: 'cacheerror' }, config.jwtSecret);

      const client = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      // Should still work despite cache failure
      const likeEventPromise = new Promise<any>((resolve) => {
        client.on('post:liked', (data) => resolve(data));
      });

      await webSocketEventsService.emitLikeEvent(
        'post',
        'test-post-cache-error',
        'other-user',
        userId,
        'cacheerror',
        true,
        1
      );

      // Should receive event despite cache failure
      const likeEvent = await likeEventPromise;
      expect(likeEvent.userId).toBe(userId);
    });

    it('should handle malformed event data gracefully', async () => {
      const userId = 'malformed-data-user';
      const token = jwt.sign({ userId, username: 'malformeduser' }, config.jwtSecret);

      const client = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      const errorPromise = new Promise<any>((resolve) => {
        client.on('error', (error) => resolve(error));
      });

      // Send malformed room join request
      client.emit('join_content', { invalidField: 'invalid' });

      const error = await errorPromise;
      expect(error.code).toBeDefined();
    });

    it('should handle client disconnection during event processing', async () => {
      const userId = 'disconnect-user';
      const token = jwt.sign({ userId, username: 'disconnectuser' }, config.jwtSecret);

      const client = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      // Disconnect client immediately
      client.disconnect();

      // Try to send event to disconnected user - should not crash
      await expect(
        webSocketEventsService.emitNotification(userId, {
          id: 'test-disconnect',
          type: 'system',
          title: 'Test',
          message: 'Test message',
          data: {},
          createdAt: new Date(),
          isRead: false
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Performance Benchmarking Tests', () => {
    it('should measure connection establishment time', async () => {
      const connectionTimes: number[] = [];
      const testCount = 20;

      for (let i = 0; i < testCount; i++) {
        const userId = `perf-test-user-${i}`;
        const token = jwt.sign({ userId, username: `perfuser${i}` }, config.jwtSecret);

        const startTime = Date.now();
        const client = io.io(`http://localhost:${port}`, {
          transports: ['websocket'],
          auth: { token }
        });
        clientSockets.push(client);

        await new Promise<void>((resolve) => {
          client.on('authenticated', () => {
            const endTime = Date.now();
            connectionTimes.push(endTime - startTime);
            resolve();
          });
        });
      }

      const averageTime = connectionTimes.reduce((sum, time) => sum + time, 0) / connectionTimes.length;
      const maxTime = Math.max(...connectionTimes);

      expect(averageTime).toBeLessThan(1000); // Average should be under 1 second
      expect(maxTime).toBeLessThan(2000); // Max should be under 2 seconds

      console.log(`Connection performance: avg=${averageTime}ms, max=${maxTime}ms`);
    });

    it('should measure event broadcasting latency', async () => {
      const userId = 'latency-test-user';
      const token = jwt.sign({ userId, username: 'latencyuser' }, config.jwtSecret);

      const client = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      const latencies: number[] = [];
      const testCount = 50;

      for (let i = 0; i < testCount; i++) {
        const startTime = Date.now();
        
        const eventPromise = new Promise<void>((resolve) => {
          client.once('notification:new', () => {
            const endTime = Date.now();
            latencies.push(endTime - startTime);
            resolve();
          });
        });

        await webSocketEventsService.emitNotification(userId, {
          id: `latency-test-${i}`,
          type: 'system',
          title: 'Latency Test',
          message: `Test message ${i}`,
          data: {},
          createdAt: new Date(),
          isRead: false
        });

        await eventPromise;
      }

      const averageLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const p95Latency = latencies.sort()[Math.floor(latencies.length * 0.95)];

      expect(averageLatency).toBeLessThan(100); // Average should be under 100ms
      expect(p95Latency).toBeLessThan(500); // 95th percentile under 500ms

      console.log(`Event latency: avg=${averageLatency}ms, p95=${p95Latency}ms, max=${maxLatency}ms`);
    });

    it('should measure memory usage under load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create many connections and events
      const connectionCount = 30;
      const connections: ClientSocketType[] = [];

      // Create connections
      for (let i = 0; i < connectionCount; i++) {
        const userId = `memory-test-user-${i}`;
        const token = jwt.sign({ userId, username: `memoryuser${i}` }, config.jwtSecret);

        const client = io.io(`http://localhost:${port}`, {
          transports: ['websocket'],
          auth: { token }
        });
        connections.push(client);
        clientSockets.push(client);

        await new Promise<void>((resolve) => {
          client.on('authenticated', () => resolve());
        });
      }

      const afterConnectionsMemory = process.memoryUsage().heapUsed;

      // Send many events
      const eventCount = 200;
      for (let i = 0; i < eventCount; i++) {
        const userId = `memory-test-user-${i % connectionCount}`;
        await webSocketEventsService.emitNotification(userId, {
          id: `memory-test-${i}`,
          type: 'system',
          title: 'Memory Test',
          message: `Test message ${i}`,
          data: { index: i },
          createdAt: new Date(),
          isRead: false
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for processing

      const finalMemory = process.memoryUsage().heapUsed;

      const connectionMemoryIncrease = afterConnectionsMemory - initialMemory;
      const eventMemoryIncrease = finalMemory - afterConnectionsMemory;

      console.log(`Memory usage: initial=${initialMemory}, +connections=${connectionMemoryIncrease}, +events=${eventMemoryIncrease}`);

      // Memory increase should be reasonable (less than 50MB for this test)
      expect(connectionMemoryIncrease).toBeLessThan(50 * 1024 * 1024);
      expect(eventMemoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('WebSocket Connection Resilience', () => {
    it('should handle reconnection scenarios', async () => {
      const userId = 'reconnect-test-user';
      const token = jwt.sign({ userId, username: 'reconnectuser' }, config.jwtSecret);

      let client = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      // Force disconnect
      client.disconnect();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Reconnect
      const newClient = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(newClient);

      await new Promise<void>((resolve) => {
        newClient.on('authenticated', (data) => {
          expect(data.userId).toBe(userId);
          resolve();
        });
      });
    });

    it('should maintain connection stability under network simulation', async () => {
      const userId = 'stability-test-user';
      const token = jwt.sign({ userId, username: 'stabilityuser' }, config.jwtSecret);

      const client = io.io(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token },
        timeout: 5000
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      let disconnections = 0;
      let reconnections = 0;

      client.on('disconnect', () => {
        disconnections++;
      });

      client.on('connect', () => {
        if (disconnections > 0) {
          reconnections++;
        }
      });

      // Simulate intermittent network issues
      for (let i = 0; i < 5; i++) {
        // Send ping-like event
        await webSocketEventsService.emitNotification(userId, {
          id: `stability-test-${i}`,
          type: 'system',
          title: 'Stability Test',
          message: 'Ping',
          data: {},
          createdAt: new Date(),
          isRead: false
        });

        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Connection should remain stable
      expect(client.connected).toBe(true);
      expect(disconnections).toBeLessThan(2); // Allow minimal disconnections
    });
  });
});