/**
 * WebSocket Performance Benchmark Tests
 * Comprehensive performance testing for WebSocket infrastructure
 */

import { Server as HTTPServer } from 'http';
import { io as ClientSocket, Socket } from 'socket.io-client';

type ClientSocketType = Socket;
import jwt from 'jsonwebtoken';
import { WebSocketServer } from '../../src/websocket/server';
import { webSocketEventsService } from '../../src/services/websocketEvents';
import { config } from '../../src/config';
import { WebSocketLoadTester, LoadTestConfig } from '../helpers/websocket-load-testing.helper';

// Mock Redis
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
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient)
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('WebSocket Performance Benchmarks', () => {
  let httpServer: HTTPServer;
  let webSocketServer: WebSocketServer;
  let port: number;
  let serverUrl: string;

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
    
    console.log(`Performance test server started on port ${port}`);
  });

  afterAll(async () => {
    webSocketServer.getIOServer().close();
    httpServer.close();
  });

  describe('Connection Performance Benchmarks', () => {
    it('should measure baseline connection performance', async () => {
      const connectionCount = 20;
      const connectionTimes: number[] = [];

      for (let i = 0; i < connectionCount; i++) {
        const userId = `perf-baseline-${i}`;
        const token = jwt.sign({ userId, username: `user${i}` }, config.jwtSecret);

        const startTime = Date.now();
        const client = ClientSocket(serverUrl, {
          transports: ['websocket'],
          auth: { token }
        });

        await new Promise<void>((resolve) => {
          client.on('authenticated', () => {
            const connectionTime = Date.now() - startTime;
            connectionTimes.push(connectionTime);
            client.disconnect();
            resolve();
          });
        });
      }

      const avgConnectionTime = connectionTimes.reduce((sum, time) => sum + time, 0) / connectionTimes.length;
      const maxConnectionTime = Math.max(...connectionTimes);
      const minConnectionTime = Math.min(...connectionTimes);

      console.log(`Connection Performance Baseline:`);
      console.log(`- Average: ${avgConnectionTime.toFixed(2)}ms`);
      console.log(`- Min: ${minConnectionTime}ms`);
      console.log(`- Max: ${maxConnectionTime}ms`);

      // Performance assertions
      expect(avgConnectionTime).toBeLessThan(500); // Average under 500ms
      expect(maxConnectionTime).toBeLessThan(1000); // Max under 1s
    }, 30000);

    it('should measure concurrent connection performance', async () => {
      const connectionCount = 50;
      const connectionPromises: Promise<number>[] = [];

      const testStartTime = Date.now();

      for (let i = 0; i < connectionCount; i++) {
        const userId = `perf-concurrent-${i}`;
        const token = jwt.sign({ userId, username: `user${i}` }, config.jwtSecret);

        const connectionPromise = new Promise<number>((resolve) => {
          const startTime = Date.now();
          const client = ClientSocket(serverUrl, {
            transports: ['websocket'],
            auth: { token }
          });

          client.on('authenticated', () => {
            const connectionTime = Date.now() - startTime;
            client.disconnect();
            resolve(connectionTime);
          });

          client.on('connect_error', () => {
            resolve(-1); // Failed connection
          });
        });

        connectionPromises.push(connectionPromise);
      }

      const connectionTimes = await Promise.all(connectionPromises);
      const testDuration = Date.now() - testStartTime;
      
      const successfulConnections = connectionTimes.filter(time => time > 0);
      const avgConnectionTime = successfulConnections.reduce((sum, time) => sum + time, 0) / successfulConnections.length;
      const successRate = (successfulConnections.length / connectionCount) * 100;
      const connectionsPerSecond = (successfulConnections.length / testDuration) * 1000;

      console.log(`Concurrent Connection Performance:`);
      console.log(`- Success Rate: ${successRate.toFixed(2)}%`);
      console.log(`- Average Connection Time: ${avgConnectionTime.toFixed(2)}ms`);
      console.log(`- Connections/Second: ${connectionsPerSecond.toFixed(2)}`);

      expect(successRate).toBeGreaterThan(90); // 90% success rate
      expect(avgConnectionTime).toBeLessThan(1000); // Average under 1s for concurrent
    }, 45000);

    it('should measure connection scalability limits', async () => {
      const scalabilityTest = async (connectionCount: number) => {
        const connections: ClientSocketType[] = [];
        let successfulConnections = 0;
        const startTime = Date.now();

        try {
          const connectionPromises = Array.from({ length: connectionCount }, async (_, i) => {
            const userId = `scale-test-${i}`;
            const token = jwt.sign({ userId, username: `scaleuser${i}` }, config.jwtSecret);

            const client = ClientSocket(serverUrl, {
              transports: ['websocket'],
              auth: { token },
              timeout: 10000
            });

            return new Promise<boolean>((resolve) => {
              const timeout = setTimeout(() => {
                resolve(false);
              }, 10000);

              client.on('authenticated', () => {
                clearTimeout(timeout);
                connections.push(client);
                successfulConnections++;
                resolve(true);
              });

              client.on('connect_error', () => {
                clearTimeout(timeout);
                resolve(false);
              });
            });
          });

          await Promise.all(connectionPromises);
          const duration = Date.now() - startTime;

          return {
            connectionCount,
            successfulConnections,
            successRate: (successfulConnections / connectionCount) * 100,
            duration,
            connectionsPerSecond: (successfulConnections / duration) * 1000
          };

        } finally {
          // Cleanup
          await Promise.all(connections.map(client => 
            new Promise<void>((resolve) => {
              if (client.connected) {
                client.disconnect();
                client.on('disconnect', () => resolve());
              } else {
                resolve();
              }
            })
          ));
        }
      };

      // Test different scales
      const scales = [10, 25, 50, 75];
      const results = [];

      for (const scale of scales) {
        console.log(`Testing scalability at ${scale} connections...`);
        const result = await scalabilityTest(scale);
        results.push(result);
        
        console.log(`Scale ${scale}: ${result.successRate.toFixed(1)}% success, ${result.connectionsPerSecond.toFixed(2)} conn/s`);
        
        // Allow some cooldown between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Verify scalability doesn't degrade significantly
      const successRates = results.map(r => r.successRate);
      const minSuccessRate = Math.min(...successRates);
      expect(minSuccessRate).toBeGreaterThan(80); // Should maintain 80%+ success rate
    }, 120000);
  });

  describe('Event Broadcasting Performance', () => {
    it('should measure single event broadcasting latency', async () => {
      const clientCount = 20;
      const clients: ClientSocketType[] = [];
      const latencies: number[] = [];

      // Setup clients
      for (let i = 0; i < clientCount; i++) {
        const userId = `event-perf-${i}`;
        const token = jwt.sign({ userId, username: `eventuser${i}` }, config.jwtSecret);

        const client = ClientSocket(serverUrl, {
          transports: ['websocket'],
          auth: { token }
        });
        clients.push(client);

        await new Promise<void>((resolve) => {
          client.on('authenticated', () => resolve());
        });
      }

      // Measure event latency
      const testEventCount = 50;
      
      for (let eventIndex = 0; eventIndex < testEventCount; eventIndex++) {
        const eventPromises = clients.map((client, clientIndex) => 
          new Promise<number>((resolve) => {
            const startTime = Date.now();
            
            client.once('notification:new', () => {
              const latency = Date.now() - startTime;
              resolve(latency);
            });
          })
        );

        const notification = {
          id: `perf-notification-${eventIndex}`,
          type: 'system' as const,
          title: 'Performance Test',
          message: `Test message ${eventIndex}`,
          data: {},
          createdAt: new Date(),
          isRead: false
        };

        // Broadcast to all clients
        await Promise.all(clients.map(async (client, index) => {
          const userId = `event-perf-${index}`;
          await webSocketEventsService.emitNotification(userId, notification);
        }));

        const eventLatencies = await Promise.all(eventPromises);
        latencies.push(...eventLatencies);

        // Small delay between events
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Cleanup
      await Promise.all(clients.map(client => 
        new Promise<void>((resolve) => {
          client.disconnect();
          client.on('disconnect', () => resolve());
        })
      ));

      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const p95Latency = latencies.sort()[Math.floor(latencies.length * 0.95)];

      console.log(`Event Broadcasting Performance:`);
      console.log(`- Average Latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`- P95 Latency: ${p95Latency.toFixed(2)}ms`);
      console.log(`- Max Latency: ${maxLatency}ms`);

      expect(avgLatency).toBeLessThan(100); // Average under 100ms
      expect(p95Latency).toBeLessThan(250); // P95 under 250ms
    }, 60000);

    it('should measure batch event performance', async () => {
      const clientCount = 30;
      const clients: ClientSocketType[] = [];

      // Setup clients
      for (let i = 0; i < clientCount; i++) {
        const userId = `batch-perf-${i}`;
        const token = jwt.sign({ userId, username: `batchuser${i}` }, config.jwtSecret);

        const client = ClientSocket(serverUrl, {
          transports: ['websocket'],
          auth: { token }
        });
        clients.push(client);

        await new Promise<void>((resolve) => {
          client.on('authenticated', () => resolve());
        });
      }

      // Test batch performance
      const batchSizes = [1, 5, 10, 20];
      const results = [];

      for (const batchSize of batchSizes) {
        let receivedEvents = 0;
        const expectedEvents = clientCount * batchSize;

        clients.forEach(client => {
          client.on('notification:batch', (notifications) => {
            receivedEvents += notifications.length;
          });
        });

        const notifications = Array.from({ length: batchSize }, (_, i) => ({
          id: `batch-notification-${batchSize}-${i}`,
          type: 'system' as const,
          title: 'Batch Test',
          message: `Batch message ${i}`,
          data: {},
          createdAt: new Date(),
          isRead: false
        }));

        const startTime = Date.now();

        // Send batch to all users
        const userIds = clients.map((_, index) => `batch-perf-${index}`);
        await webSocketEventsService.emitBatchPresenceNotifications(userIds, notifications);

        // Wait for all events to be received
        while (receivedEvents < expectedEvents && Date.now() - startTime < 5000) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        const duration = Date.now() - startTime;
        const eventsPerSecond = (receivedEvents / duration) * 1000;

        results.push({
          batchSize,
          receivedEvents,
          expectedEvents,
          successRate: (receivedEvents / expectedEvents) * 100,
          duration,
          eventsPerSecond
        });

        console.log(`Batch Size ${batchSize}: ${receivedEvents}/${expectedEvents} events, ${eventsPerSecond.toFixed(2)} events/s`);
        
        // Reset for next test
        clients.forEach(client => {
          client.removeAllListeners('notification:batch');
        });
        receivedEvents = 0;
      }

      // Cleanup
      await Promise.all(clients.map(client => 
        new Promise<void>((resolve) => {
          client.disconnect();
          client.on('disconnect', () => resolve());
        })
      ));

      // Verify batch performance scales reasonably
      expect(results.every(r => r.successRate > 90)).toBe(true);
      expect(results[results.length - 1].eventsPerSecond).toBeGreaterThan(100);
    }, 60000);
  });

  describe('Memory and Resource Performance', () => {
    it('should measure memory usage under connection load', async () => {
      const initialMemory = process.memoryUsage();
      const clients: ClientSocketType[] = [];
      const connectionCount = 100;

      console.log(`Initial Memory: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

      // Create connections in batches to avoid overwhelming
      const batchSize = 10;
      for (let batch = 0; batch < connectionCount / batchSize; batch++) {
        const batchPromises = [];

        for (let i = 0; i < batchSize; i++) {
          const clientIndex = batch * batchSize + i;
          const userId = `memory-test-${clientIndex}`;
          const token = jwt.sign({ userId, username: `memuser${clientIndex}` }, config.jwtSecret);

          const clientPromise = new Promise<ClientSocketType | null>((resolve) => {
            const client = ClientSocket(serverUrl, {
              transports: ['websocket'],
              auth: { token }
            });

            client.on('authenticated', () => resolve(client));
            client.on('connect_error', () => resolve(null));
            
            setTimeout(() => resolve(null), 5000); // Timeout
          });

          batchPromises.push(clientPromise);
        }

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(client => {
          if (client) clients.push(client);
        });

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const afterConnectionsMemory = process.memoryUsage();
      console.log(`After ${clients.length} connections: ${(afterConnectionsMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

      // Send events to measure event processing memory
      const eventCount = 500;
      for (let i = 0; i < eventCount; i++) {
        const randomClientIndex = Math.floor(Math.random() * clients.length);
        const userId = `memory-test-${randomClientIndex}`;

        await webSocketEventsService.emitNotification(userId, {
          id: `memory-event-${i}`,
          type: 'system',
          title: 'Memory Test',
          message: `Memory test event ${i}`,
          data: { index: i },
          createdAt: new Date(),
          isRead: false
        });

        // Occasional garbage collection
        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }

      const afterEventsMemory = process.memoryUsage();
      console.log(`After ${eventCount} events: ${(afterEventsMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

      // Cleanup connections
      await Promise.all(clients.map(client => 
        new Promise<void>((resolve) => {
          if (client.connected) {
            client.disconnect();
            client.on('disconnect', () => resolve());
          } else {
            resolve();
          }
        })
      ));

      // Final memory check
      if (global.gc) global.gc();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const finalMemory = process.memoryUsage();
      console.log(`After cleanup: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

      // Memory usage assertions
      const connectionMemoryIncrease = afterConnectionsMemory.heapUsed - initialMemory.heapUsed;
      const eventMemoryIncrease = afterEventsMemory.heapUsed - afterConnectionsMemory.heapUsed;
      const memoryPerConnection = connectionMemoryIncrease / clients.length;

      console.log(`Memory per connection: ${(memoryPerConnection / 1024).toFixed(2)}KB`);

      // Reasonable memory usage expectations
      expect(memoryPerConnection).toBeLessThan(50 * 1024); // Less than 50KB per connection
      expect(connectionMemoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB for all connections
      expect(eventMemoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB for all events
    }, 120000);

    it('should measure CPU performance under load', async () => {
      const config: LoadTestConfig = {
        connectionCount: 50,
        eventCount: 200,
        concurrentEvents: 25,
        testDurationMs: 30000,
        rampUpDurationMs: 5000,
        serverUrl
      };

      const loadTester = new WebSocketLoadTester(config);
      
      // Measure CPU time before test
      const beforeCpuUsage = process.cpuUsage();
      const beforeTime = Date.now();
      
      const metrics = await loadTester.executeLoadTest();
      
      const afterCpuUsage = process.cpuUsage(beforeCpuUsage);
      const testDuration = Date.now() - beforeTime;
      
      const cpuPercentage = ((afterCpuUsage.user + afterCpuUsage.system) / (testDuration * 1000)) * 100;
      
      console.log(`CPU Performance:`);
      console.log(`- CPU Usage: ${cpuPercentage.toFixed(2)}%`);
      console.log(`- Test Duration: ${testDuration}ms`);
      console.log(`- Successful Connections: ${metrics.successfulConnections}`);
      console.log(`- Successful Events: ${metrics.successfulEvents}`);
      console.log(`- Average Connection Time: ${metrics.averageConnectionTime.toFixed(2)}ms`);
      console.log(`- Average Event Latency: ${metrics.averageEventLatency.toFixed(2)}ms`);

      // Performance expectations
      expect(metrics.successfulConnections).toBeGreaterThan(config.connectionCount * 0.8);
      expect(metrics.successfulEvents).toBeGreaterThan(config.eventCount * 0.8);
      expect(cpuPercentage).toBeLessThan(80); // Should not use more than 80% CPU
    }, 60000);
  });

  describe('Network Performance Simulation', () => {
    it('should handle network latency simulation', async () => {
      const clientCount = 10;
      const clients: ClientSocketType[] = [];

      // Create clients with simulated network delay
      for (let i = 0; i < clientCount; i++) {
        const userId = `latency-test-${i}`;
        const token = jwt.sign({ userId, username: `latencyuser${i}` }, config.jwtSecret);

        const client = ClientSocket(serverUrl, {
          transports: ['websocket'],
          auth: { token },
          timeout: 10000,
          // Simulate network conditions
          randomizationFactor: 0.2,
        });
        clients.push(client);

        await new Promise<void>((resolve) => {
          client.on('authenticated', () => resolve());
        });
      }

      // Test with artificial delays
      const roundTripTimes: number[] = [];

      for (let i = 0; i < 20; i++) {
        const startTime = Date.now();
        
        const responses = await Promise.all(clients.map((client, index) => 
          new Promise<number>((resolve) => {
            client.once('notification:new', () => {
              resolve(Date.now() - startTime);
            });
          })
        ));

        // Broadcast event
        const notification = {
          id: `latency-test-${i}`,
          type: 'system' as const,
          title: 'Latency Test',
          message: 'Testing network latency',
          data: {},
          createdAt: new Date(),
          isRead: false
        };

        await Promise.all(clients.map(async (_, index) => {
          const userId = `latency-test-${index}`;
          await webSocketEventsService.emitNotification(userId, notification);
        }));

        const avgRoundTrip = responses.reduce((sum, time) => sum + time, 0) / responses.length;
        roundTripTimes.push(avgRoundTrip);
      }

      // Cleanup
      await Promise.all(clients.map(client => 
        new Promise<void>((resolve) => {
          client.disconnect();
          client.on('disconnect', () => resolve());
        })
      ));

      const avgRoundTrip = roundTripTimes.reduce((sum, time) => sum + time, 0) / roundTripTimes.length;
      const maxRoundTrip = Math.max(...roundTripTimes);
      const consistency = 1 - (Math.max(...roundTripTimes) - Math.min(...roundTripTimes)) / avgRoundTrip;

      console.log(`Network Latency Performance:`);
      console.log(`- Average Round Trip: ${avgRoundTrip.toFixed(2)}ms`);
      console.log(`- Max Round Trip: ${maxRoundTrip}ms`);
      console.log(`- Consistency: ${(consistency * 100).toFixed(2)}%`);

      expect(avgRoundTrip).toBeLessThan(200); // Under 200ms average
      expect(consistency).toBeGreaterThan(0.7); // 70%+ consistency
    }, 45000);
  });
});