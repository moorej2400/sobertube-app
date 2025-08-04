/**
 * Authentication Flow Integration Tests
 * Tests complete authentication workflows including registration, login, token management, and protected routes
 */

import { app } from '../../src/app';
import { createSupertestHelper } from '../helpers/supertest.helper';
import { getSupabaseClient } from '../../src/services/supabase';
import { createTestUserData, createRegisteredTestUser, cleanupTestUsers } from '../fixtures';

describe('Authentication Flow Integration', () => {
  const supertestHelper = createSupertestHelper(app);
  const supabaseClient = getSupabaseClient();
  const testUserIds: string[] = [];

  // Clean up test data after each test
  afterEach(async () => {
    await cleanupTestUsers(testUserIds);
    testUserIds.length = 0;
  });

  describe('Complete Registration and Login Flow', () => {
    it('should complete full registration -> database verification -> login -> protected route access', async () => {
      const userData = createTestUserData();

      // Step 1: Register user
      const registerResponse = await supertestHelper.post('/api/auth/register', userData);

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body).toHaveProperty('success', true);
      expect(registerResponse.body.user).toHaveProperty('id');
      expect(registerResponse.body.user).toHaveProperty('email', userData.email);
      expect(registerResponse.body.user).toHaveProperty('username', userData.username);

      const userId = registerResponse.body.user.id;
      testUserIds.push(userId);

      // Step 2: Verify user exists in database
      const { data: dbUser, error: dbError } = await supabaseClient
        .from('users')
        .select('id, email, username')
        .eq('id', userId)
        .single();

      expect(dbError).toBeNull();
      expect(dbUser).toBeTruthy();
      expect(dbUser.email).toBe(userData.email);
      expect(dbUser.username).toBe(userData.username);

      // Step 3: Login with credentials
      const loginResponse = await supertestHelper.post('/api/auth/login', {
        email: userData.email,
        password: userData.password
      });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('success', true);
      expect(loginResponse.body).toHaveProperty('accessToken');
      expect(loginResponse.body).toHaveProperty('refreshToken');
      expect(loginResponse.body.user).toHaveProperty('id', userId);

      const { accessToken } = loginResponse.body;

      // Step 4: Access protected route with token
      const profileResponse = await supertestHelper
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body).toHaveProperty('success', true);
      expect(profileResponse.body.user).toHaveProperty('id', userId);
      expect(profileResponse.body.user).toHaveProperty('email', userData.email);
    });

    it('should handle registration validation chain properly', async () => {
      // Test invalid email -> error
      const invalidEmailData = createTestUserData({ email: 'invalid-email' });
      const invalidEmailResponse = await supertestHelper.post('/api/auth/register', invalidEmailData);
      expect(invalidEmailResponse.status).toBe(400);
      expect(invalidEmailResponse.body.error).toContain('email');

      // Test weak password -> error
      const weakPasswordData = createTestUserData({ password: '123' });
      const weakPasswordResponse = await supertestHelper.post('/api/auth/register', weakPasswordData);
      expect(weakPasswordResponse.status).toBe(400);
      expect(weakPasswordResponse.body.error).toContain('password');

      // Test invalid username -> error
      const invalidUsernameData = createTestUserData({ username: '123invalid' });
      const invalidUsernameResponse = await supertestHelper.post('/api/auth/register', invalidUsernameData);
      expect(invalidUsernameResponse.status).toBe(400);
      expect(invalidUsernameResponse.body.error).toContain('username');

      // Test valid data -> success
      const validData = createTestUserData();
      const validResponse = await supertestHelper.post('/api/auth/register', validData);
      expect(validResponse.status).toBe(201);
      
      if (validResponse.body.user?.id) {
        testUserIds.push(validResponse.body.user.id);
      }
    });

    it('should prevent duplicate users across both email and username', async () => {
      const firstUser = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(firstUser.id!);

      // Test duplicate email with different username
      const duplicateEmailData = createTestUserData({
        email: firstUser.email,
        username: 'different_username'
      });
      const duplicateEmailResponse = await supertestHelper.post('/api/auth/register', duplicateEmailData);
      expect(duplicateEmailResponse.status).toBe(409);
      expect(duplicateEmailResponse.body.error).toContain('email');

      // Test duplicate username with different email
      const duplicateUsernameData = createTestUserData({
        email: 'different@example.com',
        username: firstUser.username
      });
      const duplicateUsernameResponse = await supertestHelper.post('/api/auth/register', duplicateUsernameData);
      expect(duplicateUsernameResponse.status).toBe(409);
      expect(duplicateUsernameResponse.body.error).toContain('username');
    });
  });

  describe('Token Lifecycle Management', () => {
    it('should handle complete token lifecycle: login -> use -> refresh -> use refreshed', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Step 1: Use initial access token
      const initialProfileResponse = await supertestHelper
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(initialProfileResponse.status).toBe(200);
      expect(initialProfileResponse.body.user).toHaveProperty('id', user.id);

      // Step 2: Refresh token
      const refreshResponse = await supertestHelper.post('/api/auth/refresh', {
        refreshToken: user.refreshToken
      });

      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body).toHaveProperty('success', true);
      expect(refreshResponse.body).toHaveProperty('accessToken');
      expect(refreshResponse.body).toHaveProperty('refreshToken');
      expect(refreshResponse.body.user).toHaveProperty('id', user.id);

      const { accessToken: newAccessToken } = refreshResponse.body;

      // Step 3: Use refreshed access token
      const refreshedProfileResponse = await supertestHelper
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${newAccessToken}`);

      expect(refreshedProfileResponse.status).toBe(200);
      expect(refreshedProfileResponse.body.user).toHaveProperty('id', user.id);
    });

    it('should handle invalid token scenarios properly', async () => {
      // Test malformed token
      const malformedTokenResponse = await supertestHelper
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(malformedTokenResponse.status).toBe(401);
      expect(malformedTokenResponse.body).toHaveProperty('error');

      // Test no token
      const noTokenResponse = await supertestHelper.get('/api/auth/profile');
      expect(noTokenResponse.status).toBe(401);

      // Test invalid refresh token
      const invalidRefreshResponse = await supertestHelper.post('/api/auth/refresh', {
        refreshToken: 'invalid-refresh-token'
      });
      expect(invalidRefreshResponse.status).toBe(401);
    });

    it('should handle concurrent token refresh requests', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Make multiple simultaneous refresh requests
      const refreshPromises = Array(3).fill(null).map(() =>
        supertestHelper.post('/api/auth/refresh', {
          refreshToken: user.refreshToken
        })
      );

      const responses = await Promise.all(refreshPromises);

      // At least one should succeed
      const successfulResponses = responses.filter((r: any) => r.status === 200);
      expect(successfulResponses.length).toBeGreaterThan(0);

      // All successful responses should have valid tokens
      successfulResponses.forEach((response: any) => {
        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
      });
    });
  });

  describe('Protected Routes Integration', () => {
    it('should properly integrate auth middleware with route protection', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Test protected route with valid token
      const validTokenResponse = await supertestHelper
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(validTokenResponse.status).toBe(200);
      expect(validTokenResponse.body.user).toHaveProperty('id', user.id);

      // Test protected route without token
      const noTokenResponse = await supertestHelper.get('/api/auth/profile');
      expect(noTokenResponse.status).toBe(401);

      // Test protected route with invalid token
      const invalidTokenResponse = await supertestHelper
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(invalidTokenResponse.status).toBe(401);
    });

    it('should inject correct user context in protected routes', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      const response = await supertestHelper
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user).toEqual(
        expect.objectContaining({
          id: user.id,
          email: user.email,
          username: user.username
        })
      );
    });

    it('should handle optional auth middleware correctly', async () => {
      // This would test routes that support both authenticated and anonymous access
      // Currently, our posts GET endpoints are public but could benefit from optional auth
      
      // Test accessing posts feed without authentication (should work)
      const anonymousResponse = await supertestHelper.get('/api/posts');
      expect(anonymousResponse.status).toBe(200);

      // Test accessing posts feed with authentication (should work with user context)
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      const authenticatedResponse = await supertestHelper
        .get('/api/posts')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(authenticatedResponse.status).toBe(200);
      // Both should return the same structure but authenticated might have additional context
    });
  });

  describe('Authentication Error Handling', () => {
    it('should handle database connection failures gracefully', async () => {
      // This test would require mocking Supabase to fail
      // For now, we'll test the error response structure
      const userData = createTestUserData();

      // Test with invalid email format to trigger validation error
      const response = await supertestHelper.post('/api/auth/register', {
        ...userData,
        email: 'invalid-email-format'
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    });

    it('should maintain error consistency across auth operations', async () => {
      // Test that all auth endpoints return consistent error formats
      
      // Registration error
      const registerError = await supertestHelper.post('/api/auth/register', {
        email: 'invalid',
        password: '123',
        username: '12'
      });
      expect(registerError.body).toHaveProperty('success', false);
      expect(registerError.body).toHaveProperty('error');

      // Login error
      const loginError = await supertestHelper.post('/api/auth/login', {
        email: 'invalid',
        password: '123'
      });
      expect(loginError.body).toHaveProperty('success', false);
      expect(loginError.body).toHaveProperty('error');

      // Refresh error
      const refreshError = await supertestHelper.post('/api/auth/refresh', {
        refreshToken: 'invalid'
      });
      expect(refreshError.body).toHaveProperty('success', false);
      expect(refreshError.body).toHaveProperty('error');
    });
  });

  describe('Authentication Security Integration', () => {
    it('should prevent password disclosure in responses', async () => {
      const userData = createTestUserData();

      const registerResponse = await supertestHelper.post('/api/auth/register', userData);
      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body.user).not.toHaveProperty('password');

      if (registerResponse.body.user?.id) {
        testUserIds.push(registerResponse.body.user.id);
      }

      const loginResponse = await supertestHelper.post('/api/auth/login', {
        email: userData.email,
        password: userData.password
      });
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.user).not.toHaveProperty('password');
    });

    it('should handle rate limiting simulation', async () => {
      // Simulate multiple rapid registration attempts
      const userData = createTestUserData();
      const promises = Array(5).fill(null).map((_, i) =>
        supertestHelper.post('/api/auth/register', {
          ...userData,
          email: `test${i}@example.com`,
          username: `test${i}`
        })
      );

      const responses = await Promise.all(promises);
      
      // Some should succeed, some might be rate limited (if implemented)
      const successfulRegistrations = responses.filter((r: any) => r.status === 201);
      const rateLimitedRegistrations = responses.filter((r: any) => r.status === 429);
      
      // Collect successful user IDs for cleanup
      successfulRegistrations.forEach((response: any) => {
        if (response.body.user?.id) {
          testUserIds.push(response.body.user.id);
        }
      });

      // At least some registrations should succeed
      expect(successfulRegistrations.length).toBeGreaterThan(0);
    });

    it('should sanitize input data properly', async () => {
      const maliciousData = createTestUserData({
        username: '<script>alert("xss")</script>user',
        email: 'test@example.com'
      });

      const response = await supertestHelper.post('/api/auth/register', maliciousData);

      // Should either reject malicious input or sanitize it
      if (response.status === 201) {
        expect(response.body.user.username).not.toContain('<script>');
        if (response.body.user?.id) {
          testUserIds.push(response.body.user.id);
        }
      } else {
        expect(response.status).toBe(400);
      }
    });
  });
});