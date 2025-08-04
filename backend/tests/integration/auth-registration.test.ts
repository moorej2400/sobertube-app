/**
 * User Registration API Tests
 * Test suite for POST /api/auth/register endpoint
 * Following TDD methodology - these tests should fail initially
 */

import { app } from '../src/app';
import { createSupertestHelper } from './helpers/supertest.helper';
import { getSupabaseClient } from '../src/services/supabase';

describe('POST /api/auth/register', () => {
  const supertestHelper = createSupertestHelper(app);
  const supabaseClient = getSupabaseClient();

  // Clean up test users after each test
  afterEach(async () => {
    // In a real implementation, we would clean up test users from Supabase
    // For now, this is a placeholder for cleanup logic
  });

  describe('Success Cases', () => {
    it('should register a new user with valid email, password, and username', async () => {
      const userData = {
        email: `test-${Date.now()}@example.com`,
        password: 'StrongPassword123!',
        username: `testuser${Date.now()}`
      };

      const response = await supertestHelper.post('/api/auth/register', userData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('email', userData.email);
      expect(response.body.user).toHaveProperty('username', userData.username);
      expect(response.body.user).not.toHaveProperty('password'); // Password should not be returned
    });

    it('should initiate email verification process for new user', async () => {
      const userData = {
        email: `verify-${Date.now()}@example.com`,
        password: 'StrongPassword123!',
        username: `verifyuser${Date.now()}`
      };

      const response = await supertestHelper.post('/api/auth/register', userData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('emailVerificationSent', true);
    });
  });

  describe('Input Validation', () => {
    it('should reject registration without email', async () => {
      const userData = {
        password: 'StrongPassword123!',
        username: 'testuser'
      };

      const response = await supertestHelper.post('/api/auth/register', userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('email');
    });

    it('should reject registration without password', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser'
      };

      const response = await supertestHelper.post('/api/auth/register', userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('password');
    });

    it('should reject registration without username', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'StrongPassword123!'
      };

      const response = await supertestHelper.post('/api/auth/register', userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('username');
    });

    it('should reject invalid email format', async () => {
      const userData = {
        email: 'invalid-email-format',
        password: 'StrongPassword123!',
        username: 'testuser'
      };

      const response = await supertestHelper.post('/api/auth/register', userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('email');
    });

    it('should reject weak passwords', async () => {
      const weakPasswords = [
        '123',           // Too short
        'password',      // No numbers/special chars
        '12345678',      // No letters
        'Password',      // No numbers/special chars
        'password123'    // No special chars
      ];

      for (const password of weakPasswords) {
        const userData = {
          email: `test-${Date.now()}@example.com`,
          password,
          username: `testuser${Date.now()}`
        };

        const response = await supertestHelper.post('/api/auth/register', userData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('password');
      }
    });

    it('should reject username that is too short', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'StrongPassword123!',
        username: 'ab' // Too short
      };

      const response = await supertestHelper.post('/api/auth/register', userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('username');
    });

    it('should reject username that is too long', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'StrongPassword123!',
        username: 'a'.repeat(51) // Too long (assuming 50 char limit)
      };

      const response = await supertestHelper.post('/api/auth/register', userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('username');
    });

    it('should reject username with invalid characters', async () => {
      const invalidUsernames = [
        'user@name',     // Special chars
        'user name',     // Spaces
        'user-name!',    // Special chars
        '123user',       // Starting with numbers
      ];

      for (const username of invalidUsernames) {
        const userData = {
          email: `test-${Date.now()}@example.com`,
          password: 'StrongPassword123!',
          username
        };

        const response = await supertestHelper.post('/api/auth/register', userData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('username');
      }
    });
  });

  describe('Duplicate Prevention', () => {
    it('should reject registration with duplicate email', async () => {
      const email = `duplicate-${Date.now()}@example.com`;
      
      // First registration
      const firstUserData = {
        email,
        password: 'StrongPassword123!',
        username: `firstuser${Date.now()}`
      };

      const firstResponse = await supertestHelper.post('/api/auth/register', firstUserData);
      expect(firstResponse.status).toBe(201);

      // Second registration with same email
      const secondUserData = {
        email, // Same email
        password: 'StrongPassword123!',
        username: `seconduser${Date.now()}`
      };

      const secondResponse = await supertestHelper.post('/api/auth/register', secondUserData);

      expect(secondResponse.status).toBe(409); // Conflict
      expect(secondResponse.body).toHaveProperty('error');
      expect(secondResponse.body.error).toContain('email');
      expect(secondResponse.body.error).toContain('already exists');
    });

    it('should reject registration with duplicate username', async () => {
      const username = `duplicateuser${Date.now()}`;
      
      // First registration
      const firstUserData = {
        email: `first-${Date.now()}@example.com`,
        password: 'StrongPassword123!',
        username
      };

      const firstResponse = await supertestHelper.post('/api/auth/register', firstUserData);
      expect(firstResponse.status).toBe(201);

      // Second registration with same username
      const secondUserData = {
        email: `second-${Date.now()}@example.com`,
        password: 'StrongPassword123!',
        username // Same username
      };

      const secondResponse = await supertestHelper.post('/api/auth/register', secondUserData);

      expect(secondResponse.status).toBe(409); // Conflict
      expect(secondResponse.body).toHaveProperty('error');
      expect(secondResponse.body.error).toContain('username');
      expect(secondResponse.body.error).toContain('already exists');
    });
  });

  describe('Security Tests', () => {
    it('should sanitize input data to prevent XSS', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'StrongPassword123!',
        username: '<script>alert("xss")</script>user'
      };

      const response = await supertestHelper.post('/api/auth/register', userData);

      // Should either reject the malicious input or sanitize it
      if (response.status === 201) {
        expect(response.body.user.username).not.toContain('<script>');
      } else {
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should prevent SQL injection attempts', async () => {
      const userData = {
        email: "test@example.com'; DROP TABLE users; --",
        password: 'StrongPassword123!',
        username: 'testuser'
      };

      const response = await supertestHelper.post('/api/auth/register', userData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should have proper rate limiting (simulated)', async () => {
      // This test simulates rate limiting behavior
      const userData = {
        email: 'ratelimit@example.com',
        password: 'StrongPassword123!',
        username: 'ratelimituser'
      };

      // Make multiple rapid requests
      const promises = Array(10).fill(null).map(() => 
        supertestHelper.post('/api/auth/register', userData)
      );

      const responses = await Promise.all(promises);

      // At least some requests should be rate limited
      const rateLimitedResponses = responses.filter((r: any) => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Supabase Integration', () => {
    it('should handle Supabase connection errors gracefully', async () => {
      // This test would mock Supabase to return an error
      const userData = {
        email: 'dbtest@example.com',
        password: 'StrongPassword123!',
        username: 'dbtestuser'
      };

      // Mock Supabase to throw an error
      jest.spyOn(supabaseClient.auth, 'signUp').mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const response = await supertestHelper.post('/api/auth/register', userData);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('registration failed');

      // Restore mock
      jest.restoreAllMocks();
    });

    it('should handle Supabase auth errors for existing users', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'StrongPassword123!',
        username: 'existinguser'
      };

      // Mock Supabase to return user already exists error
      jest.spyOn(supabaseClient.auth, 'signUp').mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'User already registered' } as any
      });

      const response = await supertestHelper.post('/api/auth/register', userData);

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');

      // Restore mock
      jest.restoreAllMocks();
    });
  });

  describe('Response Format', () => {
    it('should return consistent JSON response format', async () => {
      const userData = {
        email: `format-${Date.now()}@example.com`,
        password: 'StrongPassword123!',
        username: `formatuser${Date.now()}`
      };

      const response = await supertestHelper.post('/api/auth/register', userData);

      expect(response.status).toBe(201);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('user');
    });

    it('should include proper security headers', async () => {
      const userData = {
        email: `security-${Date.now()}@example.com`,
        password: 'StrongPassword123!',
        username: `securityuser${Date.now()}`
      };

      const response = await supertestHelper.post('/api/auth/register', userData);

      supertestHelper.validateSecurityHeaders(response);
    });
  });
});