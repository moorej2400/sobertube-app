/**
 * Error Handling System Tests
 * Tests custom error classes, error middleware, and error recovery mechanisms
 */

import request from 'supertest';
import { app, server } from '../src/index';
import { 
  AppError, 
  ValidationError, 
  DatabaseError, 
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError 
} from '../src/utils/errors';

describe('Custom Error Classes', () => {
  afterAll((done) => {
    server.close(done);
  });

  describe('AppError Base Class', () => {
    test('should create AppError with default values', () => {
      const error = new AppError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    test('should create AppError with custom status code', () => {
      const error = new AppError('Custom error', 400);
      
      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    test('should create AppError as non-operational', () => {
      const error = new AppError('Non-operational error', 500, false);
      
      expect(error.isOperational).toBe(false);
    });
  });

  describe('ValidationError', () => {
    test('should create ValidationError with correct properties', () => {
      const details = [
        { field: 'email', message: 'Invalid email format' },
        { field: 'password', message: 'Password too short' }
      ];
      const error = new ValidationError('Validation failed', details);
      
      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('ValidationError');
      expect(error.details).toEqual(details);
    });
  });

  describe('DatabaseError', () => {
    test('should create DatabaseError with correct properties', () => {
      const error = new DatabaseError('Connection failed', 'CONN_TIMEOUT');
      
      expect(error.message).toBe('Connection failed');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('DatabaseError');
      expect(error.code).toBe('CONN_TIMEOUT');
    });
  });

  describe('AuthenticationError', () => {
    test('should create AuthenticationError with correct properties', () => {
      const error = new AuthenticationError('Invalid credentials');
      
      expect(error.message).toBe('Invalid credentials');
      expect(error.statusCode).toBe(401);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AuthenticationError');
    });
  });

  describe('AuthorizationError', () => {
    test('should create AuthorizationError with correct properties', () => {
      const error = new AuthorizationError('Access denied');
      
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AuthorizationError');
    });
  });

  describe('NotFoundError', () => {
    test('should create NotFoundError with correct properties', () => {
      const error = new NotFoundError('User not found');
      
      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('NotFoundError');
    });
  });

  describe('RateLimitError', () => {
    test('should create RateLimitError with correct properties', () => {
      const error = new RateLimitError('Too many requests', 60);
      
      expect(error.message).toBe('Too many requests');
      expect(error.statusCode).toBe(429);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('RateLimitError');
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('Enhanced Error Handling Middleware', () => {
    describe('Error Response Format', () => {
      test('should handle custom AppError with proper format', async () => {
        const response = await request(app)
          .get('/test/error/app')
          .expect(400);

        expect(response.body).toEqual({
          success: false,
          error: {
            message: 'Test application error',
            type: 'AppError',
            statusCode: 400,
            timestamp: expect.any(String),
            requestId: expect.any(String)
          }
        });
      });

      test('should handle ValidationError with validation details', async () => {
        const response = await request(app)
          .get('/test/error/validation')
          .expect(400);

        expect(response.body).toEqual({
          success: false,
          error: {
            message: 'Validation failed',
            type: 'ValidationError',
            statusCode: 400,
            timestamp: expect.any(String),
            requestId: expect.any(String),
            details: expect.any(Array)
          }
        });
      });

      test('should handle DatabaseError with error code', async () => {
        const response = await request(app)
          .get('/test/error/database')
          .expect(500);

        expect(response.body).toEqual({
          success: false,
          error: {
            message: 'Database connection failed',
            type: 'DatabaseError',
            statusCode: 500,
            timestamp: expect.any(String),
            requestId: expect.any(String),
            code: 'CONN_FAILED'
          }
        });
      });

      test('should handle generic errors as 500', async () => {
        const response = await request(app)
          .get('/test/error/generic')
          .expect(500);

        expect(response.body).toEqual({
          success: false,
          error: {
            message: 'Generic error message',
            type: 'Error',
            statusCode: 500,
            timestamp: expect.any(String),
            requestId: expect.any(String)
          }
        });
      });

      test('should include stack trace in development mode', async () => {
        // Set NODE_ENV to development temporarily
        const originalEnv = process.env['NODE_ENV'];
        process.env['NODE_ENV'] = 'development';

        const response = await request(app)
          .get('/test/error/generic')
          .expect(500);

        expect(response.body.error).toHaveProperty('stack');

        // Restore original environment
        process.env['NODE_ENV'] = originalEnv;
      });

      test('should not include stack trace in production mode', async () => {
        // Set NODE_ENV to production temporarily
        const originalEnv = process.env['NODE_ENV'];
        process.env['NODE_ENV'] = 'production';

        const response = await request(app)
          .get('/test/error/generic')
          .expect(500);

        expect(response.body.error).not.toHaveProperty('stack');

        // Restore original environment
        process.env['NODE_ENV'] = originalEnv;
      });
    });

    describe('Async Error Handling', () => {
      test('should handle async errors properly', async () => {
        const response = await request(app)
          .get('/test/error/async')
          .expect(500);

        expect(response.body).toEqual({
          success: false,
          error: {
            message: 'Async operation failed',
            type: 'Error',
            statusCode: 500,
            timestamp: expect.any(String),
            requestId: expect.any(String)
          }
        });
      });

      test('should handle promise rejections', async () => {
        const response = await request(app)
          .get('/test/error/promise')
          .expect(500);

        expect(response.body).toEqual({
          success: false,
          error: {
            message: 'Promise rejected',
            type: 'Error',
            statusCode: 500,
            timestamp: expect.any(String),
            requestId: expect.any(String)
          }
        });
      });
    });
  });
});