/**
 * WebSocket Message Compressor
 * Advanced message compression with adaptive algorithms and performance optimization
 */

import * as zlib from 'zlib';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const deflate = promisify(zlib.deflate);
const inflate = promisify(zlib.inflate);
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface MessageCompressorConfig {
  enabled?: boolean;
  algorithm?: 'deflate' | 'gzip';
  compressionLevel?: number;
  threshold?: number;
  maxConcurrentOperations?: number;
}

export interface CompressionResult {
  isCompressed: boolean;
  originalData?: string;
  compressedData?: Buffer;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  algorithm?: string;
  metadata?: {
    messageId: string;
    timestamp: Date;
  };
  error?: Error;
  fallbackToUncompressed?: boolean;
  skipReason?: string | undefined;
}

export interface BinaryCompressionResult {
  isCompressed: boolean;
  originalData?: Buffer;
  compressedData?: Buffer;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  algorithm?: string;
}

export interface PerformanceStats {
  totalMessages: number;
  compressedMessages: number;
  averageCompressionRatio: number;
  totalTimeSaved: number;
  averageCompressionTime: number;
  concurrentOperations: number;
  queuedOperations: number;
  errorCount: number;
  successRate: number;
}

export class MessageCompressor {
  private config: Required<MessageCompressorConfig>;
  private concurrentOperations = 0;
  private operationQueue: Array<() => Promise<void>> = [];
  private performanceStats: PerformanceStats;
  private loadFactor = 0;
  private adaptiveLevel: number;
  private adaptiveThreshold: number;

  constructor(config: MessageCompressorConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      algorithm: config.algorithm ?? 'deflate',
      compressionLevel: config.compressionLevel ?? 6,
      threshold: config.threshold ?? 100,
      maxConcurrentOperations: config.maxConcurrentOperations ?? 10
    };

    this.adaptiveLevel = this.config.compressionLevel;
    this.adaptiveThreshold = this.config.threshold;

    this.performanceStats = {
      totalMessages: 0,
      compressedMessages: 0,
      averageCompressionRatio: 0,
      totalTimeSaved: 0,
      averageCompressionTime: 0,
      concurrentOperations: 0,
      queuedOperations: 0,
      errorCount: 0,
      successRate: 0
    };

    logger.info('Message compressor initialized', {
      component: 'MessageCompressor',
      config: this.config
    });
  }

  /**
   * Compress a string message
   */
  public async compress(message: string): Promise<CompressionResult> {
    this.performanceStats.totalMessages++;

    if (!this.config.enabled) {
      return this.createUncompressedResult(message, 'disabled');
    }

    if (this.loadFactor > 0.9) {
      return this.createUncompressedResult(message, 'high_load');
    }

    const originalSize = Buffer.byteLength(message, 'utf8');
    
    if (originalSize < this.adaptiveThreshold) {
      return this.createUncompressedResult(message, 'below_threshold');
    }

    const startTime = Date.now();
    
    try {
      const compressed = await this.executeWithConcurrencyControl(async () => {
        return await this.performCompression(message);
      });

      const compressionTime = Date.now() - startTime;
      this.updatePerformanceStats(originalSize, compressed.length, compressionTime, true);

      const result: CompressionResult = {
        isCompressed: true,
        compressedData: compressed,
        originalSize,
        compressedSize: compressed.length,
        compressionRatio: compressed.length / originalSize,
        algorithm: this.config.algorithm,
        metadata: {
          messageId: this.generateMessageId(),
          timestamp: new Date()
        }
      };

      this.performanceStats.compressedMessages++;
      return result;

    } catch (error) {
      const compressionTime = Date.now() - startTime;
      this.updatePerformanceStats(originalSize, originalSize, compressionTime, false);

      logger.warn('Compression failed, falling back to uncompressed', {
        component: 'MessageCompressor',
        error: error instanceof Error ? error.message : 'Unknown error',
        messageSize: originalSize
      });

      return {
        ...this.createUncompressedResult(message),
        error: error instanceof Error ? error : new Error('Unknown compression error'),
        fallbackToUncompressed: true
      };
    }
  }

  /**
   * Compress binary data
   */
  public async compressBinary(data: Buffer): Promise<BinaryCompressionResult> {
    if (!this.config.enabled || data.length < this.config.threshold) {
      return {
        isCompressed: false,
        originalData: data,
        originalSize: data.length,
        compressedSize: data.length,
        compressionRatio: 1
      };
    }

    try {
      const compressed = await this.executeWithConcurrencyControl(async () => {
        if (this.config.algorithm === 'gzip') {
          return await gzip(data, { level: this.adaptiveLevel });
        } else {
          return await deflate(data, { level: this.adaptiveLevel });
        }
      });

      return {
        isCompressed: true,
        compressedData: compressed,
        originalSize: data.length,
        compressedSize: compressed.length,
        compressionRatio: compressed.length / data.length,
        algorithm: this.config.algorithm
      };

    } catch (error) {
      logger.warn('Binary compression failed', {
        component: 'MessageCompressor',
        error: error instanceof Error ? error.message : 'Unknown error',
        dataSize: data.length
      });

      return {
        isCompressed: false,
        originalData: data,
        originalSize: data.length,
        compressedSize: data.length,
        compressionRatio: 1
      };
    }
  }

  /**
   * Decompress a compressed message
   */
  public async decompress(compressed: CompressionResult): Promise<string> {
    if (!compressed.isCompressed) {
      return compressed.originalData!;
    }

    if (!compressed.compressedData) {
      throw new Error('No compressed data available');
    }

    try {
      const decompressed = await this.executeWithConcurrencyControl(async () => {
        if (compressed.algorithm === 'gzip') {
          return await gunzip(compressed.compressedData!);
        } else {
          return await inflate(compressed.compressedData!);
        }
      });

      return decompressed.toString('utf8');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown decompression error';
      logger.error('Decompression failed', {
        component: 'MessageCompressor',
        error: errorMsg,
        algorithm: compressed.algorithm,
        compressedSize: compressed.compressedSize
      });
      
      throw new Error(`Decompression failed: ${errorMsg}`);
    }
  }

  /**
   * Decompress binary data
   */
  public async decompressBinary(compressed: BinaryCompressionResult): Promise<Buffer> {
    if (!compressed.isCompressed) {
      return compressed.originalData!;
    }

    if (!compressed.compressedData) {
      throw new Error('No compressed data available');
    }

    try {
      if (compressed.algorithm === 'gzip') {
        return await gunzip(compressed.compressedData);
      } else {
        return await inflate(compressed.compressedData);
      }
    } catch (error) {
      throw new Error(`Binary decompression failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform the actual compression
   */
  private async performCompression(message: string): Promise<Buffer> {
    const data = Buffer.from(message, 'utf8');
    
    if (this.config.algorithm === 'gzip') {
      return await gzip(data, { level: this.adaptiveLevel });
    } else {
      return await deflate(data, { level: this.adaptiveLevel });
    }
  }

  /**
   * Execute operation with concurrency control
   */
  private async executeWithConcurrencyControl<T>(operation: () => Promise<T>): Promise<T> {
    if (this.concurrentOperations >= this.config.maxConcurrentOperations) {
      return new Promise((resolve, reject) => {
        this.operationQueue.push(async () => {
          try {
            const result = await this.executeOperation(operation);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
        this.performanceStats.queuedOperations++;
      });
    }

    return this.executeOperation(operation);
  }

  /**
   * Execute a single operation
   */
  private async executeOperation<T>(operation: () => Promise<T>): Promise<T> {
    this.concurrentOperations++;
    this.performanceStats.concurrentOperations = Math.max(
      this.performanceStats.concurrentOperations,
      this.concurrentOperations
    );

    try {
      const result = await operation();
      return result;
    } finally {
      this.concurrentOperations--;
      this.processQueue();
    }
  }

  /**
   * Process the operation queue
   */
  private processQueue(): void {
    if (this.operationQueue.length > 0 && this.concurrentOperations < this.config.maxConcurrentOperations) {
      const nextOperation = this.operationQueue.shift();
      if (nextOperation) {
        nextOperation();
        this.performanceStats.queuedOperations--;
      }
    }
  }

  /**
   * Create uncompressed result
   */
  private createUncompressedResult(message: string, skipReason?: string): CompressionResult {
    const size = Buffer.byteLength(message, 'utf8');
    return {
      isCompressed: false,
      originalData: message,
      originalSize: size,
      compressedSize: size,
      compressionRatio: 1,
      skipReason
    };
  }

  /**
   * Update performance statistics
   */
  private updatePerformanceStats(originalSize: number, compressedSize: number, compressionTime: number, success: boolean): void {
    if (success) {
      const ratio = compressedSize / originalSize;
      this.performanceStats.averageCompressionRatio = 
        (this.performanceStats.averageCompressionRatio * (this.performanceStats.compressedMessages - 1) + ratio) / 
        this.performanceStats.compressedMessages;

      this.performanceStats.totalTimeSaved += originalSize - compressedSize;
    } else {
      this.performanceStats.errorCount++;
    }

    this.performanceStats.averageCompressionTime = 
      (this.performanceStats.averageCompressionTime * (this.performanceStats.totalMessages - 1) + compressionTime) / 
      this.performanceStats.totalMessages;

    this.performanceStats.successRate = 
      (this.performanceStats.totalMessages - this.performanceStats.errorCount) / this.performanceStats.totalMessages;

    this.adaptCompressionSettings();
  }

  /**
   * Adapt compression settings based on performance
   */
  private adaptCompressionSettings(): void {
    // Adjust compression level based on average compression time
    if (this.performanceStats.averageCompressionTime > 200) {
      this.adaptiveLevel = Math.max(1, this.adaptiveLevel - 1);
    } else if (this.performanceStats.averageCompressionTime < 50) {
      this.adaptiveLevel = Math.min(9, this.adaptiveLevel + 1);
    }

    // Adjust threshold based on compression ratio
    if (this.performanceStats.averageCompressionRatio > 0.8) {
      this.adaptiveThreshold += 50; // Increase threshold for poor compression
    } else if (this.performanceStats.averageCompressionRatio < 0.5) {
      this.adaptiveThreshold = Math.max(50, this.adaptiveThreshold - 25); // Decrease threshold for good compression
    }
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Getter methods for testing and monitoring
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public getAlgorithm(): string {
    return this.config.algorithm;
  }

  public getCompressionLevel(): number {
    return this.config.compressionLevel;
  }

  public getThreshold(): number {
    return this.config.threshold;
  }

  public getPerformanceStats(): PerformanceStats {
    return { ...this.performanceStats };
  }

  public getAdaptiveCompressionLevel(): number {
    return this.adaptiveLevel;
  }

  public getAdaptiveThreshold(): number {
    return this.adaptiveThreshold;
  }

  public setLoadFactor(factor: number): void {
    this.loadFactor = Math.max(0, Math.min(1, factor));
  }

  public destroy(): void {
    // Clear the operation queue
    this.operationQueue = [];
    this.concurrentOperations = 0;

    // Reset statistics
    this.performanceStats = {
      totalMessages: 0,
      compressedMessages: 0,
      averageCompressionRatio: 0,
      totalTimeSaved: 0,
      averageCompressionTime: 0,
      concurrentOperations: 0,
      queuedOperations: 0,
      errorCount: 0,
      successRate: 0
    };

    logger.info('Message compressor destroyed', {
      component: 'MessageCompressor'
    });
  }
}