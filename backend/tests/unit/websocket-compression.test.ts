/**
 * WebSocket Message Compression Unit Tests
 * Tests for advanced message compression and bandwidth optimization
 */

import { MessageCompressor } from '../../src/websocket/messageCompressor';
import { CompressionStats } from '../../src/websocket/compressionStats';

describe('WebSocket Message Compression', () => {
  describe('MessageCompressor', () => {
    let compressor: MessageCompressor;

    beforeEach(() => {
      compressor = new MessageCompressor({
        enabled: true,
        algorithm: 'deflate',
        compressionLevel: 6,
        threshold: 100, // Compress messages > 100 bytes
        maxConcurrentOperations: 10
      });
    });

    afterEach(() => {
      compressor.destroy();
    });

    describe('Compression Configuration', () => {
      it('should initialize with correct compression settings', () => {
        expect(compressor.isEnabled()).toBe(true);
        expect(compressor.getAlgorithm()).toBe('deflate');
        expect(compressor.getCompressionLevel()).toBe(6);
        expect(compressor.getThreshold()).toBe(100);
      });

      it('should support multiple compression algorithms', () => {
        const gzipCompressor = new MessageCompressor({
          algorithm: 'gzip',
          compressionLevel: 3
        });

        expect(gzipCompressor.getAlgorithm()).toBe('gzip');
        expect(gzipCompressor.getCompressionLevel()).toBe(3);

        gzipCompressor.destroy();
      });

      it('should disable compression when configured', () => {
        const disabledCompressor = new MessageCompressor({
          enabled: false
        });

        expect(disabledCompressor.isEnabled()).toBe(false);
        
        disabledCompressor.destroy();
      });
    });

    describe('Message Compression', () => {
      it('should compress large messages', async () => {
        const largeMessage = JSON.stringify({
          type: 'feed_update',
          data: Array(50).fill({
            id: 'post-' + Math.random(),
            content: 'This is a test post with substantial content that should benefit from compression',
            author: 'Test User',
            timestamp: new Date().toISOString(),
            likes: Math.floor(Math.random() * 100),
            comments: Array(10).fill('Comment text here')
          })
        });

        const compressed = await compressor.compress(largeMessage);
        
        expect(compressed.isCompressed).toBe(true);
        expect(compressed.compressedData).toBeDefined();
        expect(compressed.originalSize).toBe(largeMessage.length);
        expect(compressed.compressedSize).toBeLessThan(compressed.originalSize);
        expect(compressed.compressionRatio).toBeGreaterThan(0);
        expect(compressed.compressionRatio).toBeLessThan(1);
        expect(compressed.algorithm).toBe('deflate');
      });

      it('should skip compression for small messages', async () => {
        const smallMessage = JSON.stringify({ type: 'ping', timestamp: Date.now() });

        const result = await compressor.compress(smallMessage);
        
        expect(result.isCompressed).toBe(false);
        expect(result.originalData).toBe(smallMessage);
        expect(result.originalSize).toBe(smallMessage.length);
        expect(result.compressedSize).toBe(smallMessage.length);
        expect(result.compressionRatio).toBe(1);
      });

      it('should handle binary data compression', async () => {
        const binaryData = Buffer.from('Binary data content that is long enough to trigger compression: ' + 'x'.repeat(200));

        const compressed = await compressor.compressBinary(binaryData);
        
        expect(compressed.isCompressed).toBe(true);
        expect(compressed.compressedData).toBeInstanceOf(Buffer);
        expect(compressed.originalSize).toBe(binaryData.length);
        expect(compressed.compressedSize).toBeLessThan(compressed.originalSize);
      });

      it('should preserve message metadata during compression', async () => {
        const message = {
          id: 'msg-123',
          type: 'notification',
          priority: 'high',
          data: 'Long notification content that should be compressed: ' + 'test '.repeat(50)
        };

        const messageString = JSON.stringify(message);
        const compressed = await compressor.compress(messageString);
        
        expect(compressed.metadata).toBeDefined();
        expect(compressed.metadata).toBeDefined();
        expect(compressed.metadata!.messageId).toBeDefined();
        expect(compressed.metadata!.timestamp).toBeInstanceOf(Date);
      });
    });

    describe('Message Decompression', () => {
      it('should decompress compressed messages correctly', async () => {
        const originalMessage = JSON.stringify({
          type: 'large_data',
          content: 'This is a large message that will be compressed and then decompressed: ' + 'data '.repeat(100)
        });

        const compressed = await compressor.compress(originalMessage);
        expect(compressed.isCompressed).toBe(true);

        const decompressed = await compressor.decompress(compressed);
        
        expect(decompressed).toBe(originalMessage);
      });

      it('should handle uncompressed messages in decompression', async () => {
        const message = JSON.stringify({ type: 'small', data: 'short' });
        const uncompressed = await compressor.compress(message);
        
        expect(uncompressed.isCompressed).toBe(false);

        const result = await compressor.decompress(uncompressed);
        expect(result).toBe(message);
      });

      it('should handle decompression errors gracefully', async () => {
        const invalidCompressedData = {
          isCompressed: true,
          compressedData: Buffer.from('invalid compressed data'),
          algorithm: 'deflate',
          originalSize: 100,
          compressedSize: 50
        };

        await expect(compressor.decompress(invalidCompressedData as any))
          .rejects.toThrow('Decompression failed');
      });

      it('should decompress binary data correctly', async () => {
        const originalBinary = Buffer.from('Binary content for compression testing: ' + 'binary '.repeat(30));
        
        const compressed = await compressor.compressBinary(originalBinary);
        expect(compressed.isCompressed).toBe(true);

        const decompressed = await compressor.decompressBinary(compressed);
        
        expect(Buffer.compare(decompressed, originalBinary)).toBe(0);
      });
    });

    describe('Compression Performance', () => {
      it('should track compression performance metrics', async () => {
        const messages = [
          'Short message',
          'Medium length message that might get compressed: ' + 'test '.repeat(20),
          'Very long message that will definitely get compressed: ' + 'content '.repeat(100)
        ];

        for (const message of messages) {
          await compressor.compress(message);
        }

        const stats = compressor.getPerformanceStats();
        
        expect(stats.totalMessages).toBe(3);
        expect(stats.compressedMessages).toBe(2); // Only medium and long messages
        expect(stats.averageCompressionRatio).toBeDefined();
        expect(stats.totalTimeSaved).toBeGreaterThanOrEqual(0);
        expect(stats.averageCompressionTime).toBeGreaterThan(0);
      });

      it('should handle concurrent compression operations', async () => {
        const messages = Array(15).fill(null).map((_, i) => 
          `Concurrent message ${i}: ` + 'content '.repeat(50)
        );

        const compressionPromises = messages.map(message => 
          compressor.compress(message)
        );

        const results = await Promise.all(compressionPromises);
        
        expect(results).toHaveLength(15);
        results.forEach(result => {
          expect(result.isCompressed).toBe(true);
          expect(result.compressionRatio).toBeLessThan(1);
        });

        const stats = compressor.getPerformanceStats();
        expect(stats.totalMessages).toBe(15);
        expect(stats.concurrentOperations).toBeLessThanOrEqual(10);
      });

      it('should queue operations when concurrent limit is exceeded', async () => {
        const manyMessages = Array(25).fill(null).map((_, i) => 
          `Message ${i}: ` + 'data '.repeat(30)
        );

        const startTime = Date.now();
        const promises = manyMessages.map(msg => compressor.compress(msg));
        
        const results = await Promise.all(promises);
        const endTime = Date.now();
        
        expect(results).toHaveLength(25);
        expect(endTime - startTime).toBeGreaterThan(0);
        
        const stats = compressor.getPerformanceStats();
        expect(stats.queuedOperations).toBeGreaterThan(0);
      });
    });

    describe('Adaptive Compression', () => {
      it('should adjust compression level based on performance', async () => {
        // Simulate high load scenario
        const messages = Array(20).fill(null).map(() => 
          'Performance test message: ' + 'load '.repeat(100)
        );

        for (const message of messages) {
          await compressor.compress(message);
        }

        // Compressor should adapt to lower compression level under load
        const adaptiveLevel = compressor.getAdaptiveCompressionLevel();
        expect(adaptiveLevel).toBeLessThanOrEqual(6);
        expect(adaptiveLevel).toBeGreaterThanOrEqual(1);
      });

      it('should dynamically adjust compression threshold', async () => {
        // Test with various message sizes
        const messageSizes = [50, 150, 300, 500, 1000];
        
        for (const size of messageSizes) {
          const message = 'x'.repeat(size);
          await compressor.compress(message);
        }

        const adaptiveThreshold = compressor.getAdaptiveThreshold();
        expect(adaptiveThreshold).toBeGreaterThan(0);
        expect(adaptiveThreshold).toBeLessThanOrEqual(1000);
      });

      it('should disable compression temporarily under extreme load', async () => {
        // Simulate extreme load
        compressor.setLoadFactor(0.95); // 95% load
        
        const message = 'High load test message: ' + 'stress '.repeat(200);
        const result = await compressor.compress(message);
        
        // Should skip compression under high load
        expect(result.isCompressed).toBe(false);
        expect(result.skipReason).toBe('high_load');
      });
    });

    describe('Error Handling and Recovery', () => {
      it('should handle compression failures gracefully', async () => {
        // Mock a compression failure
        jest.spyOn(compressor as any, 'performCompression')
          .mockRejectedValueOnce(new Error('Compression engine failure'));

        const message = 'Test message for failure handling: ' + 'fail '.repeat(50);
        
        const result = await compressor.compress(message);
        
        expect(result.isCompressed).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.fallbackToUncompressed).toBe(true);
      });

      it('should recover from temporary compression issues', async () => {
        let callCount = 0;
        jest.spyOn(compressor as any, 'performCompression')
          .mockImplementation(() => {
            callCount++;
            if (callCount <= 2) {
              return Promise.reject(new Error('Temporary failure'));
            }
            return Promise.resolve({
              isCompressed: true,
              compressedData: Buffer.from('compressed'),
              originalSize: 100,
              compressedSize: 50
            });
          });

        const message = 'Recovery test message: ' + 'recover '.repeat(30);
        
        // Should retry and eventually succeed
        const result = await compressor.compress(message);
        expect(result.isCompressed).toBe(true);
        expect(callCount).toBe(3); // Initial + 2 retries
      });

      it('should maintain compression statistics during errors', async () => {
        // Cause some compression errors
        jest.spyOn(compressor as any, 'performCompression')
          .mockRejectedValue(new Error('Mock error'));

        const messages = ['msg1', 'msg2', 'msg3'].map(msg => msg + 'x'.repeat(100));
        
        for (const message of messages) {
          await compressor.compress(message);
        }

        const stats = compressor.getPerformanceStats();
        expect(stats.totalMessages).toBe(3);
        expect(stats.errorCount).toBe(3);
        expect(stats.successRate).toBe(0);
      });
    });
  });

  describe('CompressionStats', () => {
    let compressionStats: CompressionStats;

    beforeEach(() => {
      compressionStats = new CompressionStats({
        trackingWindow: 60000, // 1 minute
        metricsInterval: 1000, // 1 second
        retentionPeriod: 300000 // 5 minutes
      });
    });

    afterEach(() => {
      compressionStats.destroy();
    });

    describe('Statistics Collection', () => {
      it('should track compression ratios over time', () => {
        compressionStats.recordCompression(1000, 600, 'deflate', 150);
        compressionStats.recordCompression(800, 500, 'gzip', 200);
        compressionStats.recordCompression(1200, 700, 'deflate', 180);

        const stats = compressionStats.getCurrentStats();
        
        expect(stats.totalCompressions).toBe(3);
        expect(stats.averageCompressionRatio).toBeCloseTo(0.6, 1);
        expect(stats.totalBytesSaved).toBe(1100); // (1000-600) + (800-500) + (1200-700)
        expect(stats.averageCompressionTime).toBeCloseTo(176.67, 1);
      });

      it('should track bandwidth savings', () => {
        // Record multiple compressions
        const compressions = [
          { original: 2000, compressed: 1000, time: 100 },
          { original: 1500, compressed: 900, time: 120 },
          { original: 3000, compressed: 1800, time: 200 }
        ];

        compressions.forEach(({ original, compressed, time }) => {
          compressionStats.recordCompression(original, compressed, 'deflate', time);
        });

        const bandwidthStats = compressionStats.getBandwidthStats();
        
        expect(bandwidthStats.totalOriginalBytes).toBe(6500);
        expect(bandwidthStats.totalCompressedBytes).toBe(3700);
        expect(bandwidthStats.totalBytesSaved).toBe(2800);
        expect(bandwidthStats.bandwidthReduction).toBeCloseTo(0.43, 2);
      });

      it('should calculate compression efficiency by algorithm', () => {
        compressionStats.recordCompression(1000, 600, 'deflate', 100);
        compressionStats.recordCompression(1000, 650, 'gzip', 120);
        compressionStats.recordCompression(1000, 580, 'deflate', 110);

        const efficiency = compressionStats.getAlgorithmEfficiency();
        
        expect(efficiency['deflate'].averageRatio).toBeCloseTo(0.59, 2);
        expect(efficiency['deflate'].averageTime).toBe(105);
        expect(efficiency['deflate'].compressionCount).toBe(2);
        
        expect(efficiency['gzip'].averageRatio).toBeCloseTo(0.65, 2);
        expect(efficiency['gzip'].averageTime).toBe(120);
        expect(efficiency['gzip'].compressionCount).toBe(1);
      });
    });

    describe('Performance Analysis', () => {
      it('should identify compression performance trends', () => {
        // Record compressions with increasing time (performance degradation)
        const times = [100, 120, 140, 160, 180];
        times.forEach((time) => {
          compressionStats.recordCompression(1000, 600, 'deflate', time);
        });

        const trends = compressionStats.getPerformanceTrends();
        
        expect(trends.compressionTime.trend).toBe('increasing');
        expect(trends.compressionTime.slope).toBeGreaterThan(0);
        expect(trends.recommendation).toContain('compression performance is degrading');
      });

      it('should detect optimal compression settings', () => {
        // Record various compression results
        const testData = [
          { size: 1000, compressed: 400, algo: 'deflate', level: 6, time: 100 },
          { size: 1000, compressed: 380, algo: 'deflate', level: 9, time: 200 },
          { size: 1000, compressed: 450, algo: 'gzip', level: 6, time: 90 },
          { size: 1000, compressed: 420, algo: 'gzip', level: 9, time: 180 }
        ];

        testData.forEach(({ size, compressed, algo, time }) => {
          compressionStats.recordCompression(size, compressed, algo, time);
        });

        const optimal = compressionStats.getOptimalSettings();
        
        expect(optimal.algorithm).toBe('deflate'); // Better ratio at level 9
        expect(optimal.compressionLevel).toBe(9);
        expect(optimal.efficiency).toBeDefined();
        expect(optimal.reasoning).toBeDefined();
      });

      it('should provide compression recommendations', () => {
        // Simulate poor compression scenario
        for (let i = 0; i < 10; i++) {
          compressionStats.recordCompression(500, 480, 'deflate', 150); // Poor ratio
        }

        const recommendations = compressionStats.getRecommendations();
        
        expect(recommendations).toContain('compression ratio is low');
        expect(recommendations).toContain('consider increasing threshold');
        expect(recommendations.length).toBeGreaterThan(0);
      });
    });

    describe('Real-time Monitoring', () => {
      it('should provide real-time compression metrics', () => {
        compressionStats.recordCompression(1000, 600, 'deflate', 100);
        compressionStats.recordCompression(800, 480, 'gzip', 90);

        const realTimeStats = compressionStats.getRealTimeStats();
        
        expect(realTimeStats.currentCompressionRate).toBeDefined();
        expect(realTimeStats.bytesPerSecond).toBeGreaterThanOrEqual(0);
        expect(realTimeStats.avgCompressionRatio).toBeCloseTo(0.6, 1);
        expect(realTimeStats.lastUpdated).toBeInstanceOf(Date);
      });

      it('should track compression rate over time windows', () => {
        // Record compressions over time
        for (let i = 0; i < 5; i++) {
          compressionStats.recordCompression(1000, 600, 'deflate', 100);
        }

        const windowStats = compressionStats.getWindowStats(30000); // Last 30 seconds
        
        expect(windowStats.compressions).toBe(5);
        expect(windowStats.averageRatio).toBeCloseTo(0.6, 1);
        expect(windowStats.compressionRate).toBeGreaterThan(0);
      });

      it('should alert on compression anomalies', () => {
        const alertCallback = jest.fn();
        compressionStats.onAlert(alertCallback);

        // Record normal compressions
        for (let i = 0; i < 5; i++) {
          compressionStats.recordCompression(1000, 600, 'deflate', 100);
        }

        // Record anomalous compression (very poor ratio)
        compressionStats.recordCompression(1000, 950, 'deflate', 300);

        expect(alertCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'poor_compression_ratio',
            severity: 'warning'
          })
        );
      });
    });

    describe('Historical Analysis', () => {
      it('should maintain historical compression data', () => {
        // Record historical data
        for (let i = 0; i < 10; i++) {
          compressionStats.recordCompression(1000, 600 + i * 10, 'deflate', 100 + i * 5);
        }

        const historicalData = compressionStats.getHistoricalData(60000);
        
        expect(historicalData.snapshots).toHaveLength(10);
        expect(historicalData.trends.compressionRatio).toBeDefined();
        expect(historicalData.trends.compressionTime).toBeDefined();
      });

      it('should clean up old historical data', () => {
        jest.useFakeTimers();
        
        // Record old data
        compressionStats.recordCompression(1000, 600, 'deflate', 100);
        
        // Fast forward past retention period
        jest.advanceTimersByTime(400000); // 6.67 minutes
        
        compressionStats.cleanupOldData();
        
        const historicalData = compressionStats.getHistoricalData(400000);
        expect(historicalData.snapshots).toHaveLength(0);
        
        jest.useRealTimers();
      });
    });
  });
});