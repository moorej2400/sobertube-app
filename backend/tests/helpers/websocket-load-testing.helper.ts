/**
 * WebSocket Load Testing Helper
 * Utilities for testing WebSocket performance and scalability
 */

import * as io from 'socket.io-client';

type ClientSocketType = io.Socket;
import jwt from 'jsonwebtoken';
import { config } from '../../src/config';

export interface LoadTestConfig {
  connectionCount: number;
  eventCount: number;
  concurrentEvents: number;
  testDurationMs: number;
  rampUpDurationMs: number;
  serverUrl: string;
}

export interface LoadTestMetrics {
  connectionTimes: number[];
  eventLatencies: number[];
  successfulConnections: number;
  failedConnections: number;
  successfulEvents: number;
  failedEvents: number;
  averageConnectionTime: number;
  averageEventLatency: number;
  p95ConnectionTime: number;
  p95EventLatency: number;
  connectionsPerSecond: number;
  eventsPerSecond: number;
  memoryUsageMB: number;
  errors: Array<{ type: string; message: string; timestamp: Date }>;
}

export interface ConnectionResult {
  success: boolean;
  connectionTime: number;
  error?: string;
  client?: ClientSocketType;
}

export interface EventResult {
  success: boolean;
  latency: number;
  error?: string;
}

export class WebSocketLoadTester {
  private clients: ClientSocketType[] = [];
  private metrics: LoadTestMetrics = {
    connectionTimes: [],
    eventLatencies: [],
    successfulConnections: 0,
    failedConnections: 0,
    successfulEvents: 0,
    failedEvents: 0,
    averageConnectionTime: 0,
    averageEventLatency: 0,
    p95ConnectionTime: 0,
    p95EventLatency: 0,
    connectionsPerSecond: 0,
    eventsPerSecond: 0,
    memoryUsageMB: 0,
    errors: []
  };

  constructor(private config: LoadTestConfig) {}

  /**
   * Execute a comprehensive load test
   */
  async executeLoadTest(): Promise<LoadTestMetrics> {
    console.log(`Starting WebSocket load test: ${this.config.connectionCount} connections, ${this.config.eventCount} events`);
    
    const testStartTime = Date.now();
    const initialMemory = process.memoryUsage().heapUsed;

    try {
      // Phase 1: Connection load test
      await this.testConnectionLoad();
      
      // Phase 2: Event broadcasting load test
      await this.testEventLoad();
      
      // Phase 3: Concurrent operations test
      await this.testConcurrentOperations();
      
    } catch (error) {
      this.recordError('LOAD_TEST_FAILURE', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      // Cleanup
      await this.cleanup();
    }

    const testEndTime = Date.now();
    const finalMemory = process.memoryUsage().heapUsed;

    // Calculate final metrics
    this.calculateMetrics(testStartTime, testEndTime, initialMemory, finalMemory);
    
    return this.metrics;
  }

  /**
   * Test connection establishment under load
   */
  private async testConnectionLoad(): Promise<void> {
    console.log('Testing connection load...');
    
    const rampUpInterval = this.config.rampUpDurationMs / this.config.connectionCount;
    const connectionPromises: Promise<ConnectionResult>[] = [];

    for (let i = 0; i < this.config.connectionCount; i++) {
      // Ramp up connections gradually
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, rampUpInterval));
      }

      const connectionPromise = this.createConnection(`load-test-user-${i}`, `loaduser${i}`);
      connectionPromises.push(connectionPromise);
    }

    const connectionResults = await Promise.allSettled(connectionPromises);
    
    connectionResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.success) {
        this.metrics.successfulConnections++;
        this.metrics.connectionTimes.push(result.value.connectionTime);
        if (result.value.client) {
          this.clients.push(result.value.client);
        }
      } else {
        this.metrics.failedConnections++;
        const error = result.status === 'rejected' ? result.reason : result.value.error;
        this.recordError('CONNECTION_FAILURE', error);
      }
    });

    console.log(`Connection test complete: ${this.metrics.successfulConnections}/${this.config.connectionCount} successful`);
  }

  /**
   * Test event broadcasting under load
   */
  private async testEventLoad(): Promise<void> {
    console.log('Testing event broadcast load...');
    
    if (this.clients.length === 0) {
      console.warn('No connected clients for event testing');
      return;
    }

    const eventPromises: Promise<EventResult>[] = [];
    const eventsPerClient = Math.floor(this.config.eventCount / this.clients.length);

    for (let clientIndex = 0; clientIndex < this.clients.length; clientIndex++) {
      const client = this.clients[clientIndex];
      
      for (let eventIndex = 0; eventIndex < eventsPerClient; eventIndex++) {
        const eventPromise = this.sendTestEvent(
          client, 
          `test-event-${clientIndex}-${eventIndex}`,
          { clientIndex, eventIndex }
        );
        eventPromises.push(eventPromise);
      }
    }

    const eventResults = await Promise.allSettled(eventPromises);
    
    eventResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.success) {
        this.metrics.successfulEvents++;
        this.metrics.eventLatencies.push(result.value.latency);
      } else {
        this.metrics.failedEvents++;
        const error = result.status === 'rejected' ? result.reason : result.value.error;
        this.recordError('EVENT_FAILURE', error);
      }
    });

    console.log(`Event test complete: ${this.metrics.successfulEvents}/${eventPromises.length} successful`);
  }

  /**
   * Test concurrent operations
   */
  private async testConcurrentOperations(): Promise<void> {
    console.log('Testing concurrent operations...');
    
    const concurrentPromises: Promise<void>[] = [];
    
    // Concurrent room joins/leaves
    concurrentPromises.push(this.testConcurrentRoomOperations());
    
    // Concurrent event emissions
    concurrentPromises.push(this.testConcurrentEventEmissions());
    
    // Concurrent presence updates
    concurrentPromises.push(this.testConcurrentPresenceUpdates());

    await Promise.all(concurrentPromises);
    
    console.log('Concurrent operations test complete');
  }

  /**
   * Test concurrent room operations
   */
  private async testConcurrentRoomOperations(): Promise<void> {
    const roomPromises = this.clients.slice(0, Math.min(10, this.clients.length)).map(async (client, index) => {
      try {
        const contentId = `test-content-${index}`;
        
        // Join room
        client.emit('join_content', { contentType: 'post', contentId });
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Leave room
        client.emit('leave_content', { contentType: 'post', contentId });
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        this.recordError('ROOM_OPERATION_FAILURE', error instanceof Error ? error.message : 'Unknown error');
      }
    });

    await Promise.all(roomPromises);
  }

  /**
   * Test concurrent event emissions
   */
  private async testConcurrentEventEmissions(): Promise<void> {
    const eventPromises = this.clients.slice(0, Math.min(20, this.clients.length)).map(async (client) => {
      try {
        client.emit('request_recommendations', { limit: 5 });
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        this.recordError('CONCURRENT_EVENT_FAILURE', error instanceof Error ? error.message : 'Unknown error');
      }
    });

    await Promise.all(eventPromises);
  }

  /**
   * Test concurrent presence updates
   */
  private async testConcurrentPresenceUpdates(): Promise<void> {
    const presencePromises = this.clients.slice(0, Math.min(15, this.clients.length)).map(async (client, index) => {
      try {
        client.emit('update_presence', { status: index % 2 === 0 ? 'online' : 'away' });
        await new Promise(resolve => setTimeout(resolve, 75));
        
      } catch (error) {
        this.recordError('PRESENCE_UPDATE_FAILURE', error instanceof Error ? error.message : 'Unknown error');
      }
    });

    await Promise.all(presencePromises);
  }

  /**
   * Create a WebSocket connection with timing
   */
  private async createConnection(userId: string, username: string): Promise<ConnectionResult> {
    const startTime = Date.now();
    
    try {
      const token = jwt.sign({ userId, username }, config.jwtSecret);
      const client = io.io(this.config.serverUrl, {
        transports: ['websocket'],
        auth: { token },
        timeout: 10000,
        reconnection: false // Disable for load testing
      });

      const result = await new Promise<ConnectionResult>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({
            success: false,
            connectionTime: Date.now() - startTime,
            error: 'Connection timeout'
          });
        }, 10000);

        client.on('authenticated', () => {
          clearTimeout(timeout);
          resolve({
            success: true,
            connectionTime: Date.now() - startTime,
            client
          });
        });

        client.on('connect_error', (error: any) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            connectionTime: Date.now() - startTime,
            error: error.message
          });
        });

        client.on('error', (error: any) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            connectionTime: Date.now() - startTime,
            error: error.message || 'Unknown error'
          });
        });
      });

      return result;
      
    } catch (error) {
      return {
        success: false,
        connectionTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send a test event and measure latency
   */
  private async sendTestEvent(client: ClientSocketType, eventId: string, data: any): Promise<EventResult> {
    const startTime = Date.now();
    
    try {
      const result = await new Promise<EventResult>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({
            success: false,
            latency: Date.now() - startTime,
            error: 'Event timeout'
          });
        }, 5000);

        // Listen for response event
        const responseHandler = (responseData: any) => {
          if (responseData.eventId === eventId) {
            clearTimeout(timeout);
            client.off('test:response', responseHandler);
            resolve({
              success: true,
              latency: Date.now() - startTime
            });
          }
        };

        client.on('test:response', responseHandler);
        
        // Emit test event
        client.emit('test:ping', { eventId, data, timestamp: startTime });
      });

      return result;
      
    } catch (error) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Record an error for metrics
   */
  private recordError(type: string, message: string): void {
    this.metrics.errors.push({
      type,
      message,
      timestamp: new Date()
    });
  }

  /**
   * Calculate final metrics
   */
  private calculateMetrics(
    testStartTime: number, 
    testEndTime: number, 
    initialMemory: number, 
    finalMemory: number
  ): void {
    const testDuration = testEndTime - testStartTime;
    
    // Connection metrics
    if (this.metrics.connectionTimes.length > 0) {
      this.metrics.averageConnectionTime = 
        this.metrics.connectionTimes.reduce((sum, time) => sum + time, 0) / this.metrics.connectionTimes.length;
      
      const sortedConnectionTimes = this.metrics.connectionTimes.sort();
      this.metrics.p95ConnectionTime = sortedConnectionTimes[Math.floor(sortedConnectionTimes.length * 0.95)];
      
      this.metrics.connectionsPerSecond = (this.metrics.successfulConnections / testDuration) * 1000;
    }

    // Event metrics
    if (this.metrics.eventLatencies.length > 0) {
      this.metrics.averageEventLatency = 
        this.metrics.eventLatencies.reduce((sum, lat) => sum + lat, 0) / this.metrics.eventLatencies.length;
      
      const sortedLatencies = this.metrics.eventLatencies.sort();
      this.metrics.p95EventLatency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];
      
      this.metrics.eventsPerSecond = (this.metrics.successfulEvents / testDuration) * 1000;
    }

    // Memory metrics
    this.metrics.memoryUsageMB = (finalMemory - initialMemory) / (1024 * 1024);
  }

  /**
   * Clean up all connections
   */
  private async cleanup(): Promise<void> {
    console.log(`Cleaning up ${this.clients.length} connections...`);
    
    const cleanupPromises = this.clients.map(client => 
      new Promise<void>((resolve) => {
        if (client.connected) {
          client.disconnect();
          client.on('disconnect', () => resolve());
          setTimeout(() => resolve(), 1000); // Timeout cleanup
        } else {
          resolve();
        }
      })
    );

    await Promise.all(cleanupPromises);
    this.clients = [];
  }

  /**
   * Generate load test report
   */
  generateReport(): string {
    const report = `
=== WebSocket Load Test Report ===

Connection Results:
- Successful: ${this.metrics.successfulConnections}
- Failed: ${this.metrics.failedConnections}
- Success Rate: ${((this.metrics.successfulConnections / (this.metrics.successfulConnections + this.metrics.failedConnections)) * 100).toFixed(2)}%
- Average Connection Time: ${this.metrics.averageConnectionTime.toFixed(2)}ms
- P95 Connection Time: ${this.metrics.p95ConnectionTime.toFixed(2)}ms
- Connections/Second: ${this.metrics.connectionsPerSecond.toFixed(2)}

Event Results:
- Successful: ${this.metrics.successfulEvents}
- Failed: ${this.metrics.failedEvents}
- Success Rate: ${((this.metrics.successfulEvents / (this.metrics.successfulEvents + this.metrics.failedEvents)) * 100).toFixed(2)}%
- Average Event Latency: ${this.metrics.averageEventLatency.toFixed(2)}ms
- P95 Event Latency: ${this.metrics.p95EventLatency.toFixed(2)}ms
- Events/Second: ${this.metrics.eventsPerSecond.toFixed(2)}

Resource Usage:
- Memory Usage: ${this.metrics.memoryUsageMB.toFixed(2)}MB

Errors:
${this.metrics.errors.length === 0 ? '- None' : this.metrics.errors.map(err => `- ${err.type}: ${err.message}`).join('\n')}

=== End Report ===
    `;

    return report.trim();
  }
}

/**
 * Utility function to run a quick load test
 */
export async function runWebSocketLoadTest(
  serverUrl: string, 
  connectionCount: number = 10, 
  eventCount: number = 50
): Promise<LoadTestMetrics> {
  const config: LoadTestConfig = {
    connectionCount,
    eventCount,
    concurrentEvents: Math.min(connectionCount, 20),
    testDurationMs: 30000,
    rampUpDurationMs: 5000,
    serverUrl
  };

  const tester = new WebSocketLoadTester(config);
  const metrics = await tester.executeLoadTest();
  
  console.log(tester.generateReport());
  
  return metrics;
}

/**
 * Utility function for stress testing
 */
export async function runWebSocketStressTest(serverUrl: string): Promise<LoadTestMetrics> {
  return runWebSocketLoadTest(serverUrl, 100, 500);
}

/**
 * Utility function for basic performance testing
 */
export async function runWebSocketPerformanceTest(serverUrl: string): Promise<LoadTestMetrics> {
  return runWebSocketLoadTest(serverUrl, 20, 100);
}