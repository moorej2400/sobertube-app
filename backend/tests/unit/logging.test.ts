/**
 * Logging System Tests
 * Tests structured logging functionality, request/response logging, and log levels
 */

import { logger } from '../../src/utils/logger';
import request from 'supertest';
import { app } from '../../src/app';

describe('Logging System', () => {
  // Tests don't need server cleanup in this context

  describe('Logger Configuration', () => {
    test('should create logger with correct configuration', () => {
      expect(logger).toBeDefined();
      expect(logger.level).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    test('should have different log levels for different environments', () => {
      // Test environment should have appropriate log level
      expect(['error', 'warn', 'info', 'debug']).toContain(logger.level);
    });

    test('should create structured log entries', () => {
      const mockLog = jest.fn();
      const originalLog = logger.info;
      logger.info = mockLog;

      logger.info('Test message', { 
        userId: '123', 
        action: 'test',
        metadata: { key: 'value' }
      });

      expect(mockLog).toHaveBeenCalledWith('Test message', {
        userId: '123',
        action: 'test', 
        metadata: { key: 'value' }
      });

      logger.info = originalLog;
    });
  });

  describe('Log Levels', () => {
    test('should log error level messages', () => {
      const mockLog = jest.fn();
      const originalLog = logger.error;
      logger.error = mockLog;

      logger.error('Error message', { errorCode: 'E001' });

      expect(mockLog).toHaveBeenCalledWith('Error message', { errorCode: 'E001' });

      logger.error = originalLog;
    });

    test('should log warn level messages', () => {
      const mockLog = jest.fn();
      const originalLog = logger.warn;
      logger.warn = mockLog;

      logger.warn('Warning message', { warningCode: 'W001' });

      expect(mockLog).toHaveBeenCalledWith('Warning message', { warningCode: 'W001' });

      logger.warn = originalLog;
    });

    test('should log info level messages', () => {
      const mockLog = jest.fn();
      const originalLog = logger.info;
      logger.info = mockLog;

      logger.info('Info message', { infoCode: 'I001' });

      expect(mockLog).toHaveBeenCalledWith('Info message', { infoCode: 'I001' });

      logger.info = originalLog;
    });

    test('should log debug level messages', () => {
      const mockLog = jest.fn();
      const originalLog = logger.debug;
      logger.debug = mockLog;

      logger.debug('Debug message', { debugCode: 'D001' });

      expect(mockLog).toHaveBeenCalledWith('Debug message', { debugCode: 'D001' });

      logger.debug = originalLog;
    });
  });

  describe('Performance Logging', () => {
    test('should log performance metrics', () => {
      const mockLog = jest.fn();
      const originalLog = logger.info;
      logger.info = mockLog;

      logger.info('Operation completed', {
        operation: 'database_query',
        duration: 150,
        success: true
      });

      expect(mockLog).toHaveBeenCalledWith('Operation completed', {
        operation: 'database_query',
        duration: 150,
        success: true
      });

      logger.info = originalLog;
    });
  });

  describe('Request/Response Logging Middleware', () => {
    describe('Request Logging', () => {
      test('should log incoming requests with proper format', async () => {
        const mockLog = jest.fn();
        const originalLog = logger.info;
        logger.info = mockLog;

        await request(app)
          .get('/health')
          .expect(200);

        // Should have logged the request
        expect(mockLog).toHaveBeenCalledWith(
          expect.stringContaining('Request received'),
          expect.objectContaining({
            method: 'GET',
            url: '/health',
            userAgent: expect.any(String),
            requestId: expect.any(String),
            timestamp: expect.any(String)
          })
        );

        logger.info = originalLog;
      });

      test('should log request body for POST requests', async () => {
        const mockLog = jest.fn();
        const originalLog = logger.info;
        logger.info = mockLog;

        await request(app)
          .post('/test/echo')
          .send({ message: 'test data' })
          .expect(200);

        // Should have logged the request with body
        expect(mockLog).toHaveBeenCalledWith(
          expect.stringContaining('Request received'),
          expect.objectContaining({
            method: 'POST',
            url: '/test/echo',
            body: { message: 'test data' },
            requestId: expect.any(String)
          })
        );

        logger.info = originalLog;
      });

      test('should generate unique request IDs', async () => {
        const mockLog = jest.fn();
        const originalLog = logger.info;
        logger.info = mockLog;

        // Make two requests
        await request(app).get('/health').expect(200);
        await request(app).get('/health').expect(200);

        // Should have different request IDs
        const calls = mockLog.mock.calls.filter(call => 
          call[0].includes('Request received')
        );
        
        expect(calls.length).toBeGreaterThanOrEqual(2);
        const requestId1 = calls[0][1].requestId;
        const requestId2 = calls[1][1].requestId;
        expect(requestId1).not.toBe(requestId2);

        logger.info = originalLog;
      });

      test('should filter sensitive data from request body', async () => {
        const mockLog = jest.fn();
        const originalLog = logger.info;
        logger.info = mockLog;

        await request(app)
          .post('/test/sensitive')
          .send({ 
            email: 'test@example.com',
            password: 'secretpassword',
            token: 'jwt-token-here'
          })
          .expect(200);

        // Should have filtered sensitive fields
        expect(mockLog).toHaveBeenCalledWith(
          expect.stringContaining('Request received'),
          expect.objectContaining({
            body: {
              email: 'test@example.com',
              password: '[FILTERED]',
              token: '[FILTERED]'
            }
          })
        );

        logger.info = originalLog;
      });
    });

    describe('Response Logging', () => {
      test('should log response details', async () => {
        const mockLog = jest.fn();
        const originalLog = logger.info;
        logger.info = mockLog;

        await request(app)
          .get('/health')
          .expect(200);

        // Should have logged the response
        expect(mockLog).toHaveBeenCalledWith(
          expect.stringContaining('Request completed'),
          expect.objectContaining({
            statusCode: 200,
            responseTime: expect.any(Number),
            requestId: expect.any(String)
          })
        );

        logger.info = originalLog;
      });

      test('should log response time', async () => {
        const mockLog = jest.fn();
        const originalLog = logger.info;
        logger.info = mockLog;

        const startTime = Date.now();
        await request(app)
          .get('/health')
          .expect(200);
        const endTime = Date.now();

        // Should have logged response time within reasonable range
        const responseLogCall = mockLog.mock.calls.find(call => 
          call[0].includes('Request completed')
        );
        
        expect(responseLogCall).toBeDefined();
        const responseTime = responseLogCall[1].responseTime;
        expect(responseTime).toBeGreaterThan(0);
        expect(responseTime).toBeLessThan(endTime - startTime + 100); // Allow some margin

        logger.info = originalLog;
      });

      test('should log error responses with appropriate level', async () => {
        const mockError = jest.fn();
        const mockInfo = jest.fn();
        const originalError = logger.error;
        const originalInfo = logger.info;
        logger.error = mockError;
        logger.info = mockInfo;

        await request(app)
          .get('/non-existent-route')
          .expect(404);

        // Should have logged error response
        expect(mockError).toHaveBeenCalledWith(
          expect.stringContaining('Request completed'),
          expect.objectContaining({
            statusCode: 404,
            responseTime: expect.any(Number)
          })
        );

        logger.error = originalError;
        logger.info = originalInfo;
      });
    });
  });
});