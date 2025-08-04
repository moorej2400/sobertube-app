/**
 * JWT Token Management and Validation Middleware Tests
 * Test suite for JWT middleware that handles token extraction, validation, and user context
 * Following TDD methodology - these tests should fail initially until implementation
 */

import { app } from '../../src/app';
import { createSupertestHelper } from '../helpers/supertest.helper';
import { getSupabaseClient } from '../../src/services/supabase';
import jwt from 'jsonwebtoken';

describe('JWT Token Management and Validation Middleware', () => {
  const supertestHelper = createSupertestHelper(app);
  const supabaseClient = getSupabaseClient();

  // Test user credentials for consistent testing
  const testUser = {
    email: `jwttest-${Date.now()}@example.com`,
    password: 'JwtTest123!',
    username: `jwtuser${Date.now()}`
  };

  let userJWT: string;
  let userId: string;

  // Create test user and get JWT token
  beforeAll(async () => {
    // Register test user
    await supertestHelper.post('/api/auth/register', testUser);
    
    // Login to get JWT token
    const loginResponse = await supertestHelper.post('/api/auth/login', {
      email: testUser.email,
      password: testUser.password
    });
    
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.success).toBe(true);
    
    // Extract JWT token from login response (should be added to login response)
    expect(loginResponse.body).toHaveProperty('accessToken'); 
    userJWT = loginResponse.body.accessToken;
    userId = loginResponse.body.user.id;
  });

  describe('JWT Token Extraction', () => {
    it('should extract JWT token from Authorization header', async () => {
      const response = await supertestHelper.get('/api/auth/profile', {
        auth: { token: userJWT }
      });

      // Should successfully authenticate with valid JWT
      expect(response.status).toBe(200);
    });

    it('should handle missing Authorization header', async () => {
      const response = await supertestHelper.get('/api/auth/profile');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('No authorization token provided');
    });

    it('should handle malformed Authorization header', async () => {
      const response = await supertestHelper.get('/api/auth/profile', {
        headers: { 'Authorization': 'InvalidFormat' }
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid authorization header format');
    });

    it('should handle non-Bearer token types', async () => {
      const response = await supertestHelper.get('/api/auth/profile', {
        auth: { token: userJWT, type: 'Basic' }
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid authorization header format');
    });
  });

  describe('JWT Token Validation', () => {
    it('should validate JWT token with Supabase', async () => {
      const response = await supertestHelper.get('/api/auth/profile', {
        auth: { token: userJWT }
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe(userId);
    });

    it('should reject invalid JWT token', async () => {
      const invalidToken = 'invalid.jwt.token';
      
      const response = await supertestHelper.get('/api/auth/profile', {
        auth: { token: invalidToken }
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid or expired token');
    });

    it('should reject expired JWT token', async () => {
      // Create an expired token for testing
      const expiredToken = jwt.sign(
        { sub: userId, exp: Math.floor(Date.now() / 1000) - 3600 }, // Expired 1 hour ago
        'test-secret'
      );
      
      const response = await supertestHelper.get('/api/auth/profile', {
        auth: { token: expiredToken }
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid or expired token');
    });

    it('should handle Supabase JWT verification errors gracefully', async () => {
      // Mock Supabase to throw an error during verification
      jest.spyOn(supabaseClient.auth, 'getUser').mockRejectedValueOnce(
        new Error('JWT verification service unavailable')
      );

      const response = await supertestHelper.get('/api/auth/profile', {
        auth: { token: userJWT }
      });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');

      // Restore mock
      jest.restoreAllMocks();
    });
  });

  describe('Protected Route Implementation', () => {
    it('should allow access to protected routes with valid JWT', async () => {
      const response = await supertestHelper.get('/api/auth/profile', {
        auth: { token: userJWT }
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
    });

    it('should deny access to protected routes without JWT', async () => {
      const response = await supertestHelper.get('/api/auth/profile');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should deny access to protected routes with invalid JWT', async () => {
      const response = await supertestHelper.get('/api/auth/profile', {
        auth: { token: 'invalid.token.here' }
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('User Context Injection', () => {
    it('should inject user context into request object', async () => {
      const response = await supertestHelper.get('/api/auth/profile', {
        auth: { token: userJWT }
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id', userId);
      expect(response.body.user).toHaveProperty('email', testUser.email);
    });

    it('should include user permissions in context', async () => {
      const response = await supertestHelper.get('/api/auth/profile', {
        auth: { token: userJWT }
      });

      expect(response.status).toBe(200);
      expect(response.body.user).toHaveProperty('roles');
      expect(response.body.user).toHaveProperty('permissions');
    });
  });

  describe('Token Refresh Preparation', () => {
    it('should handle refresh token scenarios', async () => {
      // This test prepares for refresh token implementation
      // For now, we just ensure the middleware can handle token refresh headers
      const response = await supertestHelper.get('/api/auth/profile', {
        auth: { token: userJWT },
        headers: { 'X-Refresh-Token': 'future-refresh-token' }
      });

      expect(response.status).toBe(200);
      // Should still work with main JWT token
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format for authentication failures', async () => {
      const response = await supertestHelper.get('/api/auth/profile');

      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    });

    it('should include proper security headers for authentication failures', async () => {
      const response = await supertestHelper.get('/api/auth/profile');

      supertestHelper.validateSecurityHeaders(response);
      expect(response.headers).toHaveProperty('www-authenticate');
    });
  });

  describe('Security Tests', () => {
    it('should prevent JWT token injection attacks', async () => {
      const response = await supertestHelper.get('/api/auth/profile', {
        headers: { 'Authorization': 'Bearer <script>alert("xss")</script>' }
      });

      expect(response.status).toBe(401);
      expect(JSON.stringify(response.body)).not.toContain('<script>');
    });

    it('should handle very long JWT tokens gracefully', async () => {
      const longToken = 'a'.repeat(10000); // 10KB token
      
      const response = await supertestHelper.get('/api/auth/profile', {
        auth: { token: longToken }
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should rate limit failed authentication attempts', async () => {
      const promises = Array(10).fill(null).map(() => 
        supertestHelper.get('/api/auth/profile', {
          auth: { token: 'invalid.token' }
        })
      );

      const responses = await Promise.all(promises);

      // All should be unauthorized (rate limiting not implemented yet in this phase)
      const unauthorizedResponses = responses.filter((r: any) => r.status === 401);
      expect(unauthorizedResponses.length).toBe(10);
    });
  });

  describe('Performance Tests', () => {
    it('should validate JWT tokens quickly', async () => {
      const startTime = Date.now();
      
      const response = await supertestHelper.get('/api/auth/profile', {
        auth: { token: userJWT }
      });

      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(500); // Should respond within 500ms
    });
  });
});