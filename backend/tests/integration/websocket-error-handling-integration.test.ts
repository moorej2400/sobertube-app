/**
 * WebSocket Error Handling and Resilience Integration Tests
 * Testing error scenarios, failure recovery, and system resilience
 */

import { Server as HTTPServer } from 'http';
import { io as ClientSocket, Socket } from 'socket.io-client';

type ClientSocketType = Socket;
import jwt from 'jsonwebtoken';
import { WebSocketServer } from '../../src/websocket/server';
import { webSocketEventsService } from '../../src/services/websocketEvents';
import { config } from '../../src/config';
import { logger } from '../../src/utils/logger';

// Mock Redis client with failure simulation
const mockRedisClient = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  isOpen: true,
  isReady: true,
  on: jest.fn(),
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  incr: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  del: jest.fn().mockResolvedValue(1),
  flushall: jest.fn().mockResolvedValue('OK'),
  // Add error simulation methods
  simulateFailure: false,
  simulateLatency: 0,
};

// Override methods to simulate failures
const originalSet = mockRedisClient.set;
mockRedisClient.set = jest.fn().mockImplementation((...args) => {
  if (mockRedisClient.simulateFailure) {
    return Promise.reject(new Error('Redis connection lost'));
  }
  if (mockRedisClient.simulateLatency > 0) {
    return new Promise(resolve => 
      setTimeout(() => resolve(originalSet(...args)), mockRedisClient.simulateLatency)
    );
  }
  return originalSet(...args);
});

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient)
}));

// Mock logger to capture error logs
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

jest.mock('../../src/utils/logger', () => ({
  logger: mockLogger
}));

describe('WebSocket Error Handling and Resilience Integration Tests', () => {
  let httpServer: HTTPServer;
  let webSocketServer: WebSocketServer;
  let port: number;
  let serverUrl: string;
  let clientSockets: ClientSocketType[] = [];

  beforeAll(async () => {
    httpServer = new HTTPServer();
    
    port = await new Promise((resolve) => {
      const server = httpServer.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          resolve(address.port);
        }
      });
    });

    serverUrl = `http://localhost:${port}`;
    webSocketServer = new WebSocketServer(httpServer, false);
    
    console.log(`Error handling test server started on port ${port}`);
  });

  afterAll(async () => {
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
    
    webSocketServer.getIOServer().close();
    httpServer.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.simulateFailure = false;
    mockRedisClient.simulateLatency = 0;
    mockRedisClient.isReady = true;
    mockRedisClient.isOpen = true;
  });

  describe('Redis Cache Failure Handling', () => {
    it('should continue WebSocket operations when Redis is unavailable', async () => {
      // Simulate Redis failure
      mockRedisClient.simulateFailure = true;
      mockRedisClient.isReady = false;

      const userId = 'redis-failure-user';
      const token = jwt.sign({ userId, username: 'redisfailure' }, config.jwtSecret);

      const client = ClientSocket(serverUrl, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      // Should still authenticate successfully
      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      // Setup event listener
      const eventPromise = new Promise<any>((resolve) => {
        client.on('post:liked', (data) => resolve(data));
      });

      // Emit like event - should work despite Redis failure
      await webSocketEventsService.emitLikeEvent(
        'post',
        'test-post-redis-fail',
        'other-user',
        userId,
        'redisfailure',
        true,
        1
      );

      const likeEvent = await eventPromise;
      expect(likeEvent.userId).toBe(userId);

      // Should log warnings about Redis failure
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis not ready'),
        expect.any(Object)
      );
    });

    it('should handle Redis timeout gracefully', async () => {
      // Simulate Redis latency/timeout
      mockRedisClient.simulateLatency = 5000; // 5 second delay

      const userId = 'redis-timeout-user';
      const token = jwt.sign({ userId, username: 'redistimeout' }, config.jwtSecret);

      const client = ClientSocket(serverUrl, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      const eventPromise = new Promise<any>((resolve) => {
        client.on('notification:new', (data) => resolve(data));
      });

      // Event should still be delivered despite slow Redis
      const startTime = Date.now();
      await webSocketEventsService.emitNotification(userId, {
        id: 'redis-timeout-test',
        type: 'system',
        title: 'Timeout Test',
        message: 'Testing Redis timeout',
        data: {},
        createdAt: new Date(),
        isRead: false
      });

      const notification = await eventPromise;
      const deliveryTime = Date.now() - startTime;

      expect(notification.id).toBe('redis-timeout-test');
      // Should deliver quickly despite Redis latency
      expect(deliveryTime).toBeLessThan(1000);
    });

    it('should recover when Redis comes back online', async () => {
      const userId = 'redis-recovery-user';
      const token = jwt.sign({ userId, username: 'redisrecovery' }, config.jwtSecret);

      const client = ClientSocket(serverUrl, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      // Start with Redis failure
      mockRedisClient.simulateFailure = true;
      mockRedisClient.isReady = false;

      // Send event during failure
      await webSocketEventsService.emitNotification(userId, {
        id: 'redis-failure-event',
        type: 'system',
        title: 'Failure Event',
        message: 'Event during Redis failure',
        data: {},
        createdAt: new Date(),
        isRead: false
      });

      // Simulate Redis recovery
      mockRedisClient.simulateFailure = false;
      mockRedisClient.isReady = true;

      const recoveryEventPromise = new Promise<any>((resolve) => {
        client.on('notification:new', (data) => resolve(data));
      });

      // Send event after recovery
      await webSocketEventsService.emitNotification(userId, {
        id: 'redis-recovery-event',
        type: 'system',
        title: 'Recovery Event',
        message: 'Event after Redis recovery',
        data: {},
        createdAt: new Date(),
        isRead: false
      });

      const recoveryEvent = await recoveryEventPromise;
      expect(recoveryEvent.id).toBe('redis-recovery-event');
    });
  });

  describe('Client Connection Error Handling', () => {
    it('should handle client disconnection during event processing', async () => {
      const userId = 'disconnect-during-event';
      const token = jwt.sign({ userId, username: 'disconnectuser' }, config.jwtSecret);

      const client = ClientSocket(serverUrl, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      // Disconnect client immediately
      client.disconnect();

      // Try to send events to disconnected user - should not crash server
      await expect(async () => {
        await webSocketEventsService.emitNotification(userId, {
          id: 'disconnect-test',
          type: 'system',
          title: 'Disconnect Test',
          message: 'Testing disconnected user',
          data: {},
          createdAt: new Date(),
          isRead: false
        });

        await webSocketEventsService.emitLikeEvent(
          'post',
          'test-post-disconnect',
          'other-user',
          userId,
          'disconnectuser',
          true,
          1
        );
      }).not.toThrow();

      // Should handle gracefully without errors
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('WebSocket server error'),
        expect.any(Object)
      );
    });

    it('should handle malformed client messages', async () => {
      const userId = 'malformed-message-user';
      const token = jwt.sign({ userId, username: 'malformeduser' }, config.jwtSecret);

      const client = ClientSocket(serverUrl, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      const errorPromises = [
        new Promise<any>((resolve) => {
          client.on('error', (error) => resolve(error));
        })
      ];

      // Send various malformed messages
      client.emit('join_content', null); // Null payload
      client.emit('join_content', { invalid: 'data' }); // Missing required fields
      client.emit('join_content', { contentType: 'invalid', contentId: 'test' }); // Invalid content type
      client.emit('join_content', { contentType: 'post', contentId: 'not-uuid' }); // Invalid UUID

      // Wait for error responses
      const errors = await Promise.race([
        Promise.all(errorPromises),
        new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 2000))
      ]);

      // Should receive error responses for malformed messages
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBeDefined();
    });

    it('should handle rapid client reconnections', async () => {
      const userId = 'rapid-reconnect-user';
      const username = 'rapiduser';
      const token = jwt.sign({ userId, username }, config.jwtSecret);

      const connectionCount = 10;
      let successfulReconnections = 0;

      for (let i = 0; i < connectionCount; i++) {
        const client = ClientSocket(serverUrl, {
          transports: ['websocket'],
          auth: { token },
          timeout: 5000
        });

        try {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Reconnection timeout'));
            }, 5000);

            client.on('authenticated', () => {
              clearTimeout(timeout);
              successfulReconnections++;
              resolve();
            });

            client.on('connect_error', () => {
              clearTimeout(timeout);
              reject(new Error('Connection failed'));
            });
          });

          // Immediate disconnect for next iteration
          client.disconnect();
          
        } catch (error) {
          // Reconnection failed - this is acceptable in rapid succession
          console.warn(`Reconnection ${i} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Small delay between reconnections
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Should handle most reconnections successfully
      expect(successfulReconnections).toBeGreaterThan(connectionCount * 0.5);
      console.log(`Rapid reconnections: ${successfulReconnections}/${connectionCount} successful`);
    });
  });

  describe('Event Processing Error Handling', () => {
    it('should handle errors in event serialization', async () => {
      const userId = 'serialization-error-user';
      const token = jwt.sign({ userId, username: 'serializationuser' }, config.jwtSecret);

      const client = ClientSocket(serverUrl, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      // Create circular reference that would cause JSON serialization error
      const circularData: any = { test: 'data' };
      circularData.circular = circularData;

      // Should handle serialization error gracefully
      await expect(async () => {
        await webSocketEventsService.emitNotification(userId, {
          id: 'serialization-error-test',
          type: 'system',
          title: 'Serialization Test',
          message: 'Testing serialization error',
          data: circularData, // This will cause serialization error
          createdAt: new Date(),
          isRead: false
        });
      }).not.toThrow();

      // Should log serialization errors
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to emit notification'),
        expect.any(Object)
      );
    });

    it('should handle batch event processing failures', async () => {
      const userCount = 5;
      const clients: ClientSocketType[] = [];

      // Setup multiple clients
      for (let i = 0; i < userCount; i++) {
        const userId = `batch-error-user-${i}`;
        const token = jwt.sign({ userId, username: `batchuser${i}` }, config.jwtSecret);

        const client = ClientSocket(serverUrl, {
          transports: ['websocket'],
          auth: { token }
        });
        clients.push(client);
        clientSockets.push(client);

        await new Promise<void>((resolve) => {
          client.on('authenticated', () => resolve());
        });
      }

      // Disconnect some clients to simulate partial failures
      clients[1].disconnect();
      clients[3].disconnect();

      const notifications = [
        {
          id: 'batch-test-1',
          type: 'system' as const,
          title: 'Batch Test 1',
          message: 'Batch message 1',
          data: {},
          createdAt: new Date(),
          isRead: false
        },
        {
          id: 'batch-test-2',
          type: 'system' as const,
          title: 'Batch Test 2',
          message: 'Batch message 2',
          data: {},
          createdAt: new Date(),
          isRead: false
        }
      ];

      const userIds = Array.from({ length: userCount }, (_, i) => `batch-error-user-${i}`);

      // Should handle batch processing with some failed users
      await expect(async () => {
        await webSocketEventsService.emitBatchPresenceNotifications(userIds, notifications);
      }).not.toThrow();

      // Connected clients should still receive notifications
      let receivedCount = 0;
      clients.forEach((client, index) => {
        if (client.connected) {
          client.on('notification:batch', () => {
            receivedCount++;
          });
        }
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(receivedCount).toBeGreaterThan(0);
    });
  });

  describe('System Resource Error Handling', () => {
    it('should handle memory pressure gracefully', async () => {
      const userId = 'memory-pressure-user';
      const token = jwt.sign({ userId, username: 'memoryuser' }, config.jwtSecret);

      const client = ClientSocket(serverUrl, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      let receivedEvents = 0;
      client.on('notification:new', () => {
        receivedEvents++;
      });

      // Send many large events to simulate memory pressure
      const largeData = 'x'.repeat(10000); // 10KB of data
      const eventCount = 100;

      for (let i = 0; i < eventCount; i++) {
        try {
          await webSocketEventsService.emitNotification(userId, {
            id: `memory-pressure-${i}`,
            type: 'system',
            title: 'Memory Pressure Test',
            message: 'Large event data',
            data: { largeData, index: i },
            createdAt: new Date(),
            isRead: false
          });
        } catch (error) {
          // Some events might fail under memory pressure - this is acceptable
          console.warn(`Event ${i} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Small delay to prevent overwhelming
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should handle most events despite memory pressure
      expect(receivedEvents).toBeGreaterThan(eventCount * 0.7);
      console.log(`Memory pressure test: ${receivedEvents}/${eventCount} events delivered`);
    });

    it('should handle network congestion', async () => {
      const clientCount = 20;
      const clients: ClientSocketType[] = [];

      // Create many clients to simulate network congestion
      for (let i = 0; i < clientCount; i++) {
        const userId = `congestion-test-${i}`;
        const token = jwt.sign({ userId, username: `congestionuser${i}` }, config.jwtSecret);

        const client = ClientSocket(serverUrl, {
          transports: ['websocket'],
          auth: { token },
          timeout: 10000
        });
        clients.push(client);
        clientSockets.push(client);
      }

      // Wait for all connections
      await Promise.all(clients.map(client => 
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000);

          client.on('authenticated', () => {
            clearTimeout(timeout);
            resolve();
          });

          client.on('connect_error', () => {
            clearTimeout(timeout);
            resolve(); // Don't fail test for connection errors under load
          });
        })
      ));

      const connectedClients = clients.filter(client => client.connected);
      console.log(`Network congestion test: ${connectedClients.length}/${clientCount} clients connected`);

      // Send burst of events to simulate congestion
      let totalEventsSent = 0;
      let totalEventsReceived = 0;

      connectedClients.forEach(client => {
        client.on('notification:new', () => {
          totalEventsReceived++;
        });
      });

      const eventPromises = connectedClients.map(async (_, index) => {
        const userId = `congestion-test-${index}`;
        
        for (let eventIndex = 0; eventIndex < 10; eventIndex++) {
          try {
            await webSocketEventsService.emitNotification(userId, {
              id: `congestion-${index}-${eventIndex}`,
              type: 'system',
              title: 'Congestion Test',
              message: `Congestion test event ${eventIndex}`,
              data: {},
              createdAt: new Date(),
              isRead: false
            });
            totalEventsSent++;
          } catch (error) {
            // Some events might fail under congestion
          }
        }
      });

      await Promise.all(eventPromises);
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for event delivery

      const deliveryRate = totalEventsReceived / totalEventsSent;
      console.log(`Congestion test: ${totalEventsReceived}/${totalEventsSent} events delivered (${(deliveryRate * 100).toFixed(1)}%)`);

      // Should maintain reasonable delivery rate under congestion
      expect(deliveryRate).toBeGreaterThan(0.5); // At least 50% delivery rate
    });
  });

  describe('Recovery and Resilience', () => {
    it('should maintain service availability during partial failures', async () => {
      const clients: ClientSocketType[] = [];
      const clientCount = 10;

      // Setup clients
      for (let i = 0; i < clientCount; i++) {
        const userId = `resilience-test-${i}`;
        const token = jwt.sign({ userId, username: `resilienceuser${i}` }, config.jwtSecret);

        const client = ClientSocket(serverUrl, {
          transports: ['websocket'],
          auth: { token }
        });
        clients.push(client);
        clientSockets.push(client);

        await new Promise<void>((resolve) => {
          client.on('authenticated', () => resolve());
        });
      }

      // Simulate various partial failures
      const failures = [
        // Redis failure
        () => {
          mockRedisClient.simulateFailure = true;
          mockRedisClient.isReady = false;
        },
        // Client disconnections
        () => {
          clients[2].disconnect();
          clients[5].disconnect();
        },
        // Network latency
        () => {
          mockRedisClient.simulateLatency = 1000;
        },
        // Recovery
        () => {
          mockRedisClient.simulateFailure = false;
          mockRedisClient.isReady = true;
          mockRedisClient.simulateLatency = 0;
        }
      ];

      let totalEventsSent = 0;
      let totalEventsReceived = 0;

      clients.forEach(client => {
        client.on('notification:new', () => {
          totalEventsReceived++;
        });
      });

      // Execute failures and continue sending events
      for (let failureIndex = 0; failureIndex < failures.length; failureIndex++) {
        console.log(`Executing failure scenario ${failureIndex + 1}/${failures.length}`);
        failures[failureIndex]();

        // Send events during this failure scenario
        for (let eventIndex = 0; eventIndex < 5; eventIndex++) {
          for (let clientIndex = 0; clientIndex < clientCount; clientIndex++) {
            const userId = `resilience-test-${clientIndex}`;
            const client = clients[clientIndex];
            
            if (client && client.connected) {
              try {
                await webSocketEventsService.emitNotification(userId, {
                  id: `resilience-${failureIndex}-${eventIndex}-${clientIndex}`,
                  type: 'system',
                  title: 'Resilience Test',
                  message: `Event during failure ${failureIndex}`,
                  data: { failureScenario: failureIndex, eventIndex },
                  createdAt: new Date(),
                  isRead: false
                });
                totalEventsSent++;
              } catch (error) {
                // Failures expected during error scenarios
              }
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Final wait for event delivery
      await new Promise(resolve => setTimeout(resolve, 2000));

      const overallDeliveryRate = totalEventsReceived / totalEventsSent;
      console.log(`Resilience test: ${totalEventsReceived}/${totalEventsSent} events delivered (${(overallDeliveryRate * 100).toFixed(1)}%)`);

      // System should maintain partial functionality during failures
      expect(overallDeliveryRate).toBeGreaterThan(0.3); // At least 30% delivery rate during failures
      expect(totalEventsReceived).toBeGreaterThan(0); // Some events should always be delivered
    });
  });
});