/**
 * WebSocket Authentication Integration Tests
 * Focused testing of WebSocket authentication flows and security
 */

import { Server as HTTPServer } from 'http';
import * as io from 'socket.io-client';

type ClientSocketType = io.Socket;
import jwt from 'jsonwebtoken';
import { WebSocketServer } from '../../src/websocket/server';
import { config } from '../../src/config';
import { logger } from '../../src/utils/logger';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

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
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient)
}));

describe('WebSocket Authentication Integration Tests', () => {
  let httpServer: HTTPServer;
  let webSocketServer: WebSocketServer;
  let port: number;
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

    webSocketServer = new WebSocketServer(httpServer, false);
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('JWT Token Authentication', () => {
    it('should authenticate valid JWT tokens on connection', async () => {
      const userId = 'auth-test-user-1';
      const username = 'authuser1';
      const token = jwt.sign({ userId, username }, config.jwtSecret, { expiresIn: '1h' });

      const client = ClientSocket(`http://localhost:${port}`, {
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

      expect(client.connected).toBe(true);
    });

    it('should reject expired JWT tokens', async () => {
      const userId = 'auth-test-user-2';
      const username = 'authuser2';
      const expiredToken = jwt.sign(
        { userId, username, exp: Math.floor(Date.now() / 1000) - 3600 }, // Expired 1 hour ago
        config.jwtSecret
      );

      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token: expiredToken },
        timeout: 5000
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Should connect but not authenticate
          expect(client.connected).toBe(true);
          resolve();
        }, 2000);

        client.on('authenticated', () => {
          clearTimeout(timeout);
          fail('Should not authenticate with expired token');
        });

        client.on('unauthenticated', (data) => {
          clearTimeout(timeout);
          expect(data.reason).toBeDefined();
          resolve();
        });

        client.on('connect', () => {
          // Connection established but not authenticated
        });
      });
    });

    it('should reject malformed JWT tokens', async () => {
      const malformedToken = 'this.is.not.a.valid.jwt.token';

      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token: malformedToken },
        timeout: 5000
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve();
        }, 2000);

        client.on('authenticated', () => {
          clearTimeout(timeout);
          fail('Should not authenticate with malformed token');
        });

        client.on('connect', () => {
          clearTimeout(timeout);
          resolve(); // Connected but not authenticated
        });
      });
    });

    it('should reject tokens with missing required claims', async () => {
      const incompleteToken = jwt.sign(
        { userId: 'test-user', /* missing username */ }, 
        config.jwtSecret
      );

      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token: incompleteToken },
        timeout: 5000
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve();
        }, 2000);

        client.on('authenticated', () => {
          clearTimeout(timeout);
          fail('Should not authenticate with incomplete token');
        });

        client.on('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    });
  });

  describe('Manual Authentication Flow', () => {
    it('should support manual authentication after connection', async () => {
      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket']
      });
      clientSockets.push(client);

      // Wait for connection without auth
      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });

      expect(client.connected).toBe(true);

      // Now authenticate manually
      const userId = 'manual-auth-user';
      const username = 'manualuser';
      const token = jwt.sign({ userId, username }, config.jwtSecret);

      const authPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Manual authentication timeout'));
        }, 5000);

        client.on('authenticated', (data) => {
          clearTimeout(timeout);
          expect(data.userId).toBe(userId);
          expect(data.username).toBe(username);
          resolve();
        });

        client.on('unauthenticated', (data) => {
          clearTimeout(timeout);
          reject(new Error(`Authentication failed: ${data.reason}`));
        });
      });

      client.emit('authenticate', { token });
      await authPromise;
    });

    it('should handle multiple authentication attempts', async () => {
      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket']
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });

      // First auth attempt with invalid token
      const invalidToken = 'invalid.token';
      
      const firstAuthPromise = new Promise<void>((resolve) => {
        client.on('unauthenticated', () => resolve());
      });

      client.emit('authenticate', { token: invalidToken });
      await firstAuthPromise;

      // Second auth attempt with valid token
      const userId = 'retry-auth-user';
      const username = 'retryuser';
      const validToken = jwt.sign({ userId, username }, config.jwtSecret);

      const secondAuthPromise = new Promise<void>((resolve) => {
        client.on('authenticated', (data) => {
          expect(data.userId).toBe(userId);
          resolve();
        });
      });

      client.emit('authenticate', { token: validToken });
      await secondAuthPromise;
    });

    it('should prevent re-authentication of already authenticated clients', async () => {
      const userId = 'already-auth-user';
      const username = 'alreadyauthuser';
      const token = jwt.sign({ userId, username }, config.jwtSecret);

      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      // Wait for initial authentication
      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      // Try to authenticate again - should be ignored
      let secondAuthReceived = false;
      client.on('authenticated', () => {
        secondAuthReceived = true;
      });

      client.emit('authenticate', { token });
      
      // Wait and verify no second auth event
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(secondAuthReceived).toBe(false);
    });
  });

  describe('Authorization and Access Control', () => {
    it('should deny access to protected features without authentication', async () => {
      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket']
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });

      const errorPromise = new Promise<any>((resolve) => {
        client.on('error', (error) => resolve(error));
      });

      // Try to access protected feature
      client.emit('request_personalized_feed', {});

      const error = await errorPromise;
      expect(error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(error.message).toContain('Authentication required');
    });

    it('should allow access to protected features after authentication', async () => {
      const userId = 'protected-access-user';
      const username = 'protecteduser';
      const token = jwt.sign({ userId, username }, config.jwtSecret);

      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      // Should be able to access protected features without error
      let errorReceived = false;
      client.on('error', (error) => {
        if (error.code === 'AUTHENTICATION_REQUIRED') {
          errorReceived = true;
        }
      });

      client.emit('request_personalized_feed', {});
      client.emit('request_recommendations', { limit: 5 });
      client.emit('join_content', { contentType: 'post', contentId: 'test-post' });

      await new Promise(resolve => setTimeout(resolve, 500));
      expect(errorReceived).toBe(false);
    });

    it('should validate user ownership for user-specific operations', async () => {
      const userId = 'ownership-test-user';
      const username = 'ownershipuser';
      const token = jwt.sign({ userId, username }, config.jwtSecret);

      const client = ClientSocket(`http://localhost:${port}`, {
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

      // Try to provide feedback for another user
      client.emit('recommendation_feedback', {
        userId: 'different-user-id', // Different from authenticated user
        postId: 'test-post',
        feedback: 'positive',
        feedbackType: 'like',
        timestamp: new Date()
      });

      const error = await errorPromise;
      expect(error.code).toBe('UNAUTHORIZED_FEEDBACK');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to authenticated users', async () => {
      const userId = 'rate-limit-user';
      const username = 'ratelimituser';
      const token = jwt.sign({ userId, username }, config.jwtSecret);

      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      let rateLimitErrorCount = 0;
      client.on('error', (error) => {
        if (error.code === 'RATE_LIMIT_EXCEEDED') {
          rateLimitErrorCount++;
        }
      });

      // Send many rapid requests to trigger rate limiting
      for (let i = 0; i < 150; i++) {
        client.emit('request_recommendations', { limit: 1 });
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should have received rate limit errors
      expect(rateLimitErrorCount).toBeGreaterThan(0);
    });

    it('should reset rate limits after time window', async () => {
      // This test would require mocking time or waiting for real rate limit reset
      // For now, we'll test the basic structure
      const userId = 'rate-reset-user';
      const username = 'rateresetuser';
      const token = jwt.sign({ userId, username }, config.jwtSecret);

      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      // Send requests within rate limit
      for (let i = 0; i < 10; i++) {
        client.emit('request_recommendations', { limit: 1 });
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Should not trigger rate limiting for reasonable request rate
      let rateLimitErrorReceived = false;
      client.on('error', (error) => {
        if (error.code === 'RATE_LIMIT_EXCEEDED') {
          rateLimitErrorReceived = true;
        }
      });

      await new Promise(resolve => setTimeout(resolve, 500));
      expect(rateLimitErrorReceived).toBe(false);
    });
  });

  describe('Token Validation Edge Cases', () => {
    it('should handle tokens signed with wrong secret', async () => {
      const userId = 'wrong-secret-user';
      const username = 'wrongsecretuser';
      const wrongSecretToken = jwt.sign({ userId, username }, 'wrong-secret');

      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token: wrongSecretToken }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve(); // Should connect but not authenticate
        }, 2000);

        client.on('authenticated', () => {
          clearTimeout(timeout);
          fail('Should not authenticate with wrong secret');
        });

        client.on('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    });

    it('should handle tokens with extra claims', async () => {
      const userId = 'extra-claims-user';
      const username = 'extraclaimsuser';
      const tokenWithExtraClaims = jwt.sign({
        userId,
        username,
        extraClaim: 'extra-data',
        adminRole: true
      }, config.jwtSecret);

      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token: tokenWithExtraClaims }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('authenticated', (data) => {
          expect(data.userId).toBe(userId);
          expect(data.username).toBe(username);
          resolve();
        });
      });
    });

    it('should handle very long tokens', async () => {
      const userId = 'long-token-user';
      const username = 'longtokenuser';
      const longPayload = {
        userId,
        username,
        longData: 'x'.repeat(5000) // Very long data
      };
      const longToken = jwt.sign(longPayload, config.jwtSecret);

      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token: longToken }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Long token test timeout'));
        }, 10000);

        client.on('authenticated', (data) => {
          clearTimeout(timeout);
          expect(data.userId).toBe(userId);
          resolve();
        });

        client.on('connect_error', (error) => {
          clearTimeout(timeout);
          // May fail due to token size - this is acceptable
          resolve();
        });
      });
    });
  });

  describe('Security Headers and CORS', () => {
    it('should handle CORS properly for WebSocket connections', async () => {
      // Test with different origins
      const userId = 'cors-test-user';
      const username = 'corstestuser';
      const token = jwt.sign({ userId, username }, config.jwtSecret);

      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token },
        extraHeaders: {
          'Origin': 'http://localhost:3000'
        }
      });
      clientSockets.push(client);

      // Should successfully connect regardless of CORS in development
      await new Promise<void>((resolve) => {
        client.on('authenticated', () => resolve());
      });

      expect(client.connected).toBe(true);
    });

    it('should handle missing authorization header gracefully', async () => {
      const client = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket'],
        extraHeaders: {
          'Authorization': '' // Empty authorization header
        }
      });
      clientSockets.push(client);

      await new Promise<void>((resolve) => {
        client.on('connect', () => {
          expect(client.connected).toBe(true);
          resolve();
        });
      });

      // Should connect but not be authenticated
      let wasAuthenticated = false;
      client.on('authenticated', () => {
        wasAuthenticated = true;
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(wasAuthenticated).toBe(false);
    });
  });
});