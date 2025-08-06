/**
 * WebSocket Event Subscription Manager Unit Tests
 * Tests for advanced event subscription management and optimization
 */

import { EventSubscriptionManager } from '../../src/websocket/eventSubscriptionManager';
import { SubscriptionOptimizer } from '../../src/websocket/subscriptionOptimizer';

describe('WebSocket Event Subscription Management', () => {
  describe('EventSubscriptionManager', () => {
    let subscriptionManager: EventSubscriptionManager;

    beforeEach(() => {
      subscriptionManager = new EventSubscriptionManager({
        maxSubscriptionsPerSocket: 100,
        subscriptionTimeout: 300000, // 5 minutes
        batchSize: 50,
        compressionEnabled: true,
        deduplicationEnabled: true
      });
    });

    afterEach(() => {
      subscriptionManager.destroy();
    });

    describe('Subscription Management', () => {
      it('should initialize with correct configuration', () => {
        expect(subscriptionManager.getMaxSubscriptionsPerSocket()).toBe(100);
        expect(subscriptionManager.getSubscriptionTimeout()).toBe(300000);
        expect(subscriptionManager.getBatchSize()).toBe(50);
        expect(subscriptionManager.isCompressionEnabled()).toBe(true);
        expect(subscriptionManager.isDeduplicationEnabled()).toBe(true);
      });

      it('should handle socket subscription to events', () => {
        const socketId = 'socket-123';
        const eventType = 'post:liked';
        const filter = { userId: 'user-456' };

        const success = subscriptionManager.subscribe(socketId, eventType, filter);
        
        expect(success).toBe(true);
        expect(subscriptionManager.getSubscriptionsForSocket(socketId)).toHaveLength(1);
        expect(subscriptionManager.getSubscribersForEvent(eventType)).toContain(socketId);
      });

      it('should enforce per-socket subscription limits', () => {
        const limitedManager = new EventSubscriptionManager({
          maxSubscriptionsPerSocket: 2
        });

        const socketId = 'socket-limited';
        
        expect(limitedManager.subscribe(socketId, 'event1')).toBe(true);
        expect(limitedManager.subscribe(socketId, 'event2')).toBe(true);
        expect(limitedManager.subscribe(socketId, 'event3')).toBe(false); // Should fail

        expect(limitedManager.getSubscriptionsForSocket(socketId)).toHaveLength(2);
        
        limitedManager.destroy();
      });

      it('should handle unsubscription from events', () => {
        const socketId = 'socket-456';
        const eventType = 'comment:created';

        subscriptionManager.subscribe(socketId, eventType);
        expect(subscriptionManager.getSubscriptionsForSocket(socketId)).toHaveLength(1);

        const unsubscribed = subscriptionManager.unsubscribe(socketId, eventType);
        
        expect(unsubscribed).toBe(true);
        expect(subscriptionManager.getSubscriptionsForSocket(socketId)).toHaveLength(0);
        expect(subscriptionManager.getSubscribersForEvent(eventType)).not.toContain(socketId);
      });

      it('should clean up all subscriptions when socket disconnects', () => {
        const socketId = 'socket-cleanup';
        const events = ['post:liked', 'comment:created', 'user:followed'];

        events.forEach(event => {
          subscriptionManager.subscribe(socketId, event);
        });

        expect(subscriptionManager.getSubscriptionsForSocket(socketId)).toHaveLength(3);

        subscriptionManager.cleanupSocket(socketId);

        expect(subscriptionManager.getSubscriptionsForSocket(socketId)).toHaveLength(0);
        events.forEach(event => {
          expect(subscriptionManager.getSubscribersForEvent(event)).not.toContain(socketId);
        });
      });
    });

    describe('Event Filtering', () => {
      it('should support complex event filters', () => {
        const socketId = 'socket-filtered';
        const eventType = 'post:activity';
        const complexFilter = {
          userId: 'user-123',
          postType: 'video',
          tags: ['recovery', 'inspiration'],
          minLikes: 10
        };

        const success = subscriptionManager.subscribe(socketId, eventType, complexFilter);
        
        expect(success).toBe(true);
        
        const subscriptions = subscriptionManager.getSubscriptionsForSocket(socketId);
        expect(subscriptions[0].filter).toEqual(complexFilter);
      });

      it('should match events against subscription filters', () => {
        const socketId = 'socket-match';
        const eventType = 'post:liked';
        
        subscriptionManager.subscribe(socketId, eventType, { userId: 'user-123' });

        const matchingEvent = {
          type: 'post:liked',
          userId: 'user-123',
          postId: 'post-456'
        };

        const nonMatchingEvent = {
          type: 'post:liked',
          userId: 'user-789',
          postId: 'post-456'
        };

        expect(subscriptionManager.matchesFilter(socketId, eventType, matchingEvent)).toBe(true);
        expect(subscriptionManager.matchesFilter(socketId, eventType, nonMatchingEvent)).toBe(false);
      });

      it('should handle wildcard subscriptions', () => {
        const socketId = 'socket-wildcard';
        
        subscriptionManager.subscribe(socketId, 'post:*'); // All post events
        subscriptionManager.subscribe(socketId, '*:created'); // All creation events

        expect(subscriptionManager.matchesEventPattern(socketId, 'post:liked')).toBe(true);
        expect(subscriptionManager.matchesEventPattern(socketId, 'post:commented')).toBe(true);
        expect(subscriptionManager.matchesEventPattern(socketId, 'comment:created')).toBe(true);
        expect(subscriptionManager.matchesEventPattern(socketId, 'user:followed')).toBe(false);
      });

      it('should support regex patterns in subscriptions', () => {
        const socketId = 'socket-regex';
        
        subscriptionManager.subscribe(socketId, /^user:(follow|unfollow)ed$/);

        expect(subscriptionManager.matchesEventPattern(socketId, 'user:followed')).toBe(true);
        expect(subscriptionManager.matchesEventPattern(socketId, 'user:unfollowed')).toBe(true);
        expect(subscriptionManager.matchesEventPattern(socketId, 'user:blocked')).toBe(false);
      });
    });

    describe('Batch Event Processing', () => {
      it('should batch multiple events for delivery', () => {
        const socketIds = ['socket-1', 'socket-2', 'socket-3'];
        const eventType = 'feed:update';

        socketIds.forEach(socketId => {
          subscriptionManager.subscribe(socketId, eventType);
        });

        const events = Array(25).fill(null).map((_, i) => ({
          type: eventType,
          data: `Event ${i}`,
          timestamp: new Date()
        }));

        subscriptionManager.queueEvents(events);

        const batches = subscriptionManager.processBatches();
        
        expect(batches.length).toBeGreaterThan(0);
        expect(batches[0].events.length).toBeLessThanOrEqual(subscriptionManager.getBatchSize());
        expect(batches[0].recipients).toEqual(expect.arrayContaining(socketIds));
      });

      it('should prioritize high-priority events', () => {
        const socketId = 'socket-priority';
        
        subscriptionManager.subscribe(socketId, 'notification:urgent');
        subscriptionManager.subscribe(socketId, 'notification:normal');

        const normalEvent = {
          type: 'notification:normal',
          data: 'Normal notification',
          priority: 'normal'
        };

        const urgentEvent = {
          type: 'notification:urgent',
          data: 'Urgent notification',
          priority: 'urgent'
        };

        subscriptionManager.queueEvent(normalEvent);
        subscriptionManager.queueEvent(urgentEvent);

        const batches = subscriptionManager.processBatches();
        
        // Urgent events should be processed first
        expect(batches[0].events[0]).toEqual(urgentEvent);
      });

      it('should handle event deduplication', () => {
        const socketId = 'socket-dedup';
        
        subscriptionManager.subscribe(socketId, 'post:liked');

        const duplicateEvent = {
          type: 'post:liked',
          postId: 'post-123',
          userId: 'user-456',
          eventId: 'like-123'
        };

        subscriptionManager.queueEvent(duplicateEvent);
        subscriptionManager.queueEvent(duplicateEvent); // Duplicate
        subscriptionManager.queueEvent({ ...duplicateEvent, eventId: 'like-124' }); // Different ID

        const batches = subscriptionManager.processBatches();
        
        // Should only contain 2 unique events
        expect(batches[0].events).toHaveLength(2);
      });
    });

    describe('Performance Optimization', () => {
      it('should provide subscription statistics', () => {
        // Create multiple subscriptions
        for (let i = 0; i < 10; i++) {
          subscriptionManager.subscribe(`socket-${i}`, 'post:liked');
          subscriptionManager.subscribe(`socket-${i}`, 'comment:created');
        }

        const stats = subscriptionManager.getSubscriptionStats();
        
        expect(stats.totalSubscriptions).toBe(20);
        expect(stats.totalSockets).toBe(10);
        expect(stats.averageSubscriptionsPerSocket).toBe(2);
        expect(stats.eventTypeDistribution).toEqual({
          'post:liked': 10,
          'comment:created': 10
        });
      });

      it('should track event delivery metrics', () => {
        const socketId = 'socket-metrics';
        
        subscriptionManager.subscribe(socketId, 'test:event');
        
        // Simulate event deliveries
        for (let i = 0; i < 5; i++) {
          subscriptionManager.recordDelivery(socketId, 'test:event', i * 10);
        }

        const metrics = subscriptionManager.getDeliveryMetrics();
        
        expect(metrics.totalDeliveries).toBe(5);
        expect(metrics.averageDeliveryTime).toBe(20); // (0+10+20+30+40)/5
        expect(metrics.deliveryRate).toBeDefined();
      });

      it('should optimize subscriptions for memory usage', () => {
        // Create many subscriptions with similar patterns
        for (let i = 0; i < 100; i++) {
          subscriptionManager.subscribe(`socket-${i}`, 'post:liked', { userId: 'user-123' });
        }

        const beforeOptimization = subscriptionManager.getMemoryUsage();
        
        subscriptionManager.optimizeSubscriptions();
        
        const afterOptimization = subscriptionManager.getMemoryUsage();
        
        expect(afterOptimization.totalBytes).toBeLessThanOrEqual(beforeOptimization.totalBytes);
      });
    });

    describe('Error Handling', () => {
      it('should handle invalid subscription attempts', () => {
        const socketId = 'socket-invalid';
        
        // Invalid event type
        expect(subscriptionManager.subscribe(socketId, null as any)).toBe(false);
        expect(subscriptionManager.subscribe(socketId, '')).toBe(false);
        
        // Invalid socket ID
        expect(subscriptionManager.subscribe('', 'valid:event')).toBe(false);
        expect(subscriptionManager.subscribe(null as any, 'valid:event')).toBe(false);
      });

      it('should gracefully handle subscription cleanup errors', () => {
        const socketId = 'socket-error';
        
        subscriptionManager.subscribe(socketId, 'test:event');
        
        // Mock an error during cleanup
        jest.spyOn(subscriptionManager as any, 'removeSubscription')
          .mockImplementationOnce(() => {
            throw new Error('Cleanup error');
          });

        // Should not throw error
        expect(() => {
          subscriptionManager.cleanupSocket(socketId);
        }).not.toThrow();
      });

      it('should handle event processing failures gracefully', () => {
        const socketId = 'socket-fail';
        
        subscriptionManager.subscribe(socketId, 'failing:event');

        const problematicEvent = {
          type: 'failing:event',
          data: null, // This might cause processing issues
          invalidProperty: undefined
        };

        // Should not throw error when processing
        expect(() => {
          subscriptionManager.queueEvent(problematicEvent);
          subscriptionManager.processBatches();
        }).not.toThrow();
      });
    });
  });

  describe('SubscriptionOptimizer', () => {
    let optimizer: SubscriptionOptimizer;

    beforeEach(() => {
      optimizer = new SubscriptionOptimizer({
        optimizationInterval: 30000,
        memoryThreshold: 100 * 1024 * 1024, // 100MB
        redundancyThreshold: 0.8,
        compressionRatio: 0.6
      });
    });

    afterEach(() => {
      optimizer.destroy();
    });

    describe('Subscription Analysis', () => {
      it('should identify redundant subscriptions', () => {
        const subscriptions = [
          { socketId: 'socket-1', eventType: 'post:liked', filter: { userId: 'user-123' } },
          { socketId: 'socket-1', eventType: 'post:liked', filter: { userId: 'user-123' } }, // Redundant
          { socketId: 'socket-2', eventType: 'post:liked', filter: { userId: 'user-456' } }
        ];

        const redundancies = optimizer.findRedundantSubscriptions(subscriptions);
        
        expect(redundancies).toHaveLength(1);
        expect(redundancies[0].type).toBe('duplicate');
        expect(redundancies[0].affectedSubscriptions).toHaveLength(2);
      });

      it('should optimize subscription patterns', () => {
        const subscriptions = [
          { socketId: 'socket-1', eventType: 'post:liked' },
          { socketId: 'socket-1', eventType: 'post:commented' },
          { socketId: 'socket-1', eventType: 'post:shared' }
        ];

        const optimizations = optimizer.optimizePatterns(subscriptions);
        
        expect(optimizations).toHaveLength(1);
        expect(optimizations[0].optimization).toBe('wildcard');
        expect(optimizations[0].suggested.eventType).toBe('post:*');
      });

      it('should calculate memory savings from optimization', () => {
        const subscriptions = Array(1000).fill(null).map((_, i) => ({
          socketId: `socket-${i}`,
          eventType: 'post:liked',
          filter: { userId: 'user-common' }
        }));

        const savings = optimizer.calculateMemorySavings(subscriptions);
        
        expect(savings.currentUsage).toBeGreaterThan(0);
        expect(savings.potentialSavings).toBeGreaterThan(0);
        expect(savings.optimizedUsage).toBeLessThan(savings.currentUsage);
      });
    });

    describe('Performance Optimization', () => {
      it('should compress subscription data', () => {
        const subscriptions = [
          { socketId: 'socket-1', eventType: 'post:liked', metadata: 'x'.repeat(1000) },
          { socketId: 'socket-2', eventType: 'post:liked', metadata: 'y'.repeat(1000) }
        ];

        const compressed = optimizer.compressSubscriptions(subscriptions);
        
        expect(compressed.isCompressed).toBe(true);
        expect(compressed.originalSize).toBeGreaterThan(compressed.compressedSize);
        expect(compressed.compressionRatio).toBeLessThan(1);
      });

      it('should merge similar subscriptions', () => {
        const subscriptions = [
          { socketId: 'socket-1', eventType: 'user:followed', filter: { followeeId: 'user-123' } },
          { socketId: 'socket-2', eventType: 'user:followed', filter: { followeeId: 'user-123' } },
          { socketId: 'socket-3', eventType: 'user:followed', filter: { followeeId: 'user-123' } }
        ];

        const merged = optimizer.mergeSimilarSubscriptions(subscriptions);
        
        expect(merged.mergedGroups).toHaveLength(1);
        expect(merged.mergedGroups[0].sockets).toHaveLength(3);
        expect(merged.mergedGroups[0].sharedFilter).toEqual({ followeeId: 'user-123' });
      });

      it('should provide optimization recommendations', () => {
        const subscriptions = Array(500).fill(null).map((_, i) => ({
          socketId: `socket-${i % 10}`, // 10 sockets with many subscriptions each
          eventType: i % 2 === 0 ? 'post:liked' : 'comment:created',
          filter: { userId: `user-${i % 5}` } // Many similar filters
        }));

        const recommendations = optimizer.getOptimizationRecommendations(subscriptions);
        
        expect(recommendations).toContain('High subscription redundancy detected');
        expect(recommendations).toContain('Consider using wildcard patterns');
        expect(recommendations.length).toBeGreaterThan(0);
      });
    });

    describe('Real-time Optimization', () => {
      it('should monitor subscription performance', () => {
        const subscriptions = [
          { socketId: 'socket-1', eventType: 'post:liked' },
          { socketId: 'socket-2', eventType: 'comment:created' }
        ];

        optimizer.addSubscriptions(subscriptions);

        // Simulate performance data
        optimizer.recordPerformanceMetric('post:liked', { deliveryTime: 150, memoryUsage: 1024 });
        optimizer.recordPerformanceMetric('comment:created', { deliveryTime: 200, memoryUsage: 2048 });

        const performance = optimizer.getPerformanceMetrics();
        
        expect(performance['post:liked'].averageDeliveryTime).toBe(150);
        expect(performance['comment:created'].averageDeliveryTime).toBe(200);
      });

      it('should auto-optimize based on thresholds', () => {
        const manySubscriptions = Array(200).fill(null).map((_, i) => ({
          socketId: `socket-${i}`,
          eventType: 'memory:intensive',
          filter: { data: 'x'.repeat(1000) }
        }));

        optimizer.addSubscriptions(manySubscriptions);

        // Trigger auto-optimization
        const optimized = optimizer.autoOptimize();
        
        expect(optimized).toBe(true);
        expect(optimizer.getLastOptimizationTime()).toBeDefined();
      });

      it('should maintain optimization history', () => {
        const subscriptions = [
          { socketId: 'socket-1', eventType: 'test:event' }
        ];

        optimizer.addSubscriptions(subscriptions);
        optimizer.autoOptimize();

        const history = optimizer.getOptimizationHistory();
        
        expect(history).toHaveLength(1);
        expect(history[0].timestamp).toBeInstanceOf(Date);
        expect(history[0].beforeCount).toBeDefined();
        expect(history[0].afterCount).toBeDefined();
        expect(history[0].memorySaved).toBeDefined();
      });
    });

    describe('Advanced Features', () => {
      it('should support subscription clustering', () => {
        const subscriptions = Array(100).fill(null).map((_, i) => ({
          socketId: `socket-${i}`,
          eventType: i < 50 ? 'posts:activity' : 'comments:activity',
          filter: { category: i < 30 ? 'tech' : i < 70 ? 'health' : 'general' }
        }));

        const clusters = optimizer.clusterSubscriptions(subscriptions);
        
        expect(clusters.length).toBeGreaterThan(1);
        clusters.forEach(cluster => {
          expect(cluster.subscriptions.length).toBeGreaterThan(0);
          expect(cluster.commonPattern).toBeDefined();
        });
      });

      it('should predict subscription patterns', () => {
        const historicalData = Array(30).fill(null).map((_, day) => ({
          date: new Date(Date.now() - day * 24 * 60 * 60 * 1000),
          subscriptions: [
            { eventType: 'post:liked', count: Math.floor(Math.random() * 100) + 50 },
            { eventType: 'comment:created', count: Math.floor(Math.random() * 80) + 30 }
          ]
        }));

        const predictions = optimizer.predictSubscriptionPatterns(historicalData);
        
        expect(predictions['post:liked'].trend).toBeDefined();
        expect(predictions['post:liked'].predictedCount).toBeGreaterThan(0);
        expect(predictions['comment:created'].trend).toBeDefined();
      });

      it('should handle subscription load balancing', () => {
        const subscriptions = Array(1000).fill(null).map((_, i) => ({
          socketId: `socket-${i}`,
          eventType: 'high:volume',
          serverId: `server-${i % 3}` // 3 servers
        }));

        const balanced = optimizer.balanceSubscriptionLoad(subscriptions);
        
        expect(balanced.servers).toHaveLength(3);
        
        const loads = balanced.servers.map(server => server.subscriptionCount);
        const maxLoad = Math.max(...loads);
        const minLoad = Math.min(...loads);
        
        // Load should be relatively balanced
        expect(maxLoad - minLoad).toBeLessThan(loads[0] * 0.2); // Within 20%
      });
    });
  });
});