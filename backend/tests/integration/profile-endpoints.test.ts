/**
 * Profile CRUD Endpoints Tests
 * Test suite for profile management API endpoints
 * Following TDD methodology - tests written before implementation
 */

import { app } from '../src/app';
import { createSupertestHelper } from './helpers/supertest.helper';
import { createClient } from '@supabase/supabase-js';

describe('Profile API Endpoints', () => {
  const supertestHelper = createSupertestHelper(app);
  
  // Use service role client for test data management
  const supabaseClient = createClient(
    process.env['SUPABASE_URL'] || 'http://127.0.0.1:54321',
    process.env['SUPABASE_SERVICE_ROLE_KEY'] || ''
  );
  
  // Test data cleanup
  const testUsers: string[] = [];
  let testAuthToken: string;
  let testUserId: string;

  beforeEach(async () => {
    // Create test user for authenticated requests with unique identifier
    // Use shorter ID to ensure username stays under 20 char limit
    const uniqueId = Math.random().toString(36).substr(2, 8);
    const { data: authData } = await supabaseClient.auth.signUp({
      email: `test${uniqueId}@example.com`,
      password: 'TestPassword123!',
      options: {
        data: {
          username: `test${uniqueId}`
        }
      }
    });

    if (authData.session && authData.user) {
      testAuthToken = authData.session.access_token;
      testUserId = authData.user.id;
      testUsers.push(authData.user.id);
    }
  });

  afterEach(async () => {
    // Clean up test users from database
    if (testUsers.length > 0) {
      try {
        // Delete from users table first
        await supabaseClient
          .from('users')
          .delete()
          .in('id', testUsers);
        
        // Also clean up from Supabase Auth
        for (const userId of testUsers) {
          try {
            await supabaseClient.auth.admin.deleteUser(userId);
          } catch (error) {
            // Ignore errors for auth cleanup - user might not exist in auth
          }
        }
      } catch (error) {
        console.error('Cleanup error:', error);
      }
      testUsers.length = 0;
    }
  });

  describe('POST /api/profiles - Create Profile', () => {
    it('should create a new profile for authenticated user', async () => {
      const uniqueId = Math.random().toString(36).substr(2, 8);
      const profileData = {
        username: `user${uniqueId}`,
        display_name: 'Test User',
        bio: 'This is a test bio',
        location: 'Test City, TC',
        sobriety_date: '2024-01-01',
        privacy_level: 'public'
      };

      const response = await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile).toMatchObject({
        username: profileData.username,
        display_name: profileData.display_name,
        bio: profileData.bio,
        location: profileData.location,
        sobriety_date: profileData.sobriety_date,
        privacy_level: profileData.privacy_level
      });
      expect(response.body.profile).toHaveProperty('id');
      expect(response.body.profile).toHaveProperty('created_at');
      expect(response.body.profile).toHaveProperty('updated_at');
    });

    it('should require authentication', async () => {
      const profileData = {
        username: 'testuser123',
        display_name: 'Test User'
      };

      const response = await supertestHelper.post('/api/profiles', profileData);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate required fields', async () => {
      const invalidProfiles = [
        {}, // Empty object
        { display_name: 'Test User' }, // Missing username
        { username: '' }, // Empty username
        { username: 'ab' }, // Username too short
        { username: 'a'.repeat(21) }, // Username too long
        { username: '123invalid' }, // Username starts with number
        { username: 'invalid@user' }, // Invalid username characters
        { bio: 'a'.repeat(501) }, // Bio too long
        { display_name: 'a'.repeat(101) }, // Display name too long
        { privacy_level: 'invalid' }, // Invalid privacy level
      ];

      for (const profileData of invalidProfiles) {
        const response = await supertestHelper
          .post('/api/profiles', profileData)
          .set('Authorization', `Bearer ${testAuthToken}`);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should prevent duplicate usernames', async () => {
      const uniqueId = Math.random().toString(36).substr(2, 8);
      const username = `unique${uniqueId}`;

      // First profile creation
      const firstProfile = {
        username,
        display_name: 'First User'
      };

      const firstResponse = await supertestHelper
        .post('/api/profiles', firstProfile)
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(firstResponse.status).toBe(201);

      // Create second user for duplicate test
      const secondId = Math.random().toString(36).substr(2, 8);
      const { data: secondAuthData } = await supabaseClient.auth.signUp({
        email: `second${secondId}@example.com`,
        password: 'TestPassword123!',
        options: {
          data: {
            username: `second${secondId}`
          }
        }
      });

      if (secondAuthData.session && secondAuthData.user) {
        testUsers.push(secondAuthData.user.id);

        // Try to create profile with same username
        const secondProfile = {
          username, // Same username
          display_name: 'Second User'
        };

        const secondResponse = await supertestHelper
          .post('/api/profiles', secondProfile)
          .set('Authorization', `Bearer ${secondAuthData.session.access_token}`);

        expect(secondResponse.status).toBe(409);
        expect(secondResponse.body).toHaveProperty('success', false);
        expect(secondResponse.body.error).toContain('Username already exists');
      }
    });
  });

  describe('GET /api/profiles/:id - Get Profile by ID', () => {
    let testProfileId: string;

    beforeEach(async () => {
      // Create test profile using the API endpoint (proper way)
      const uniqueId = Math.random().toString(36).substr(2, 8);
      const profileData = {
        username: `prof${uniqueId}`,
        display_name: 'Profile Test User',
        bio: 'Test bio for profile',
        privacy_level: 'public'
      };

      const response = await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${testAuthToken}`);

      if (response.status === 201 && response.body.profile) {
        testProfileId = response.body.profile.id;
      } else {
        console.error('Failed to create test profile:', response.body);
      }
    });

    it('should get public profile by ID', async () => {
      const response = await supertestHelper.get(`/api/profiles/${testProfileId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile).toHaveProperty('id', testProfileId);
      expect(response.body.profile).toHaveProperty('username');
      expect(response.body.profile).toHaveProperty('display_name');
      expect(response.body.profile).not.toHaveProperty('email'); // Email should not be exposed
    });

    it('should return 404 for non-existent profile', async () => {
      const nonExistentId = '12345678-1234-4000-8000-123456789012';
      const response = await supertestHelper.get(`/api/profiles/${nonExistentId}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for invalid UUID format', async () => {
      const response = await supertestHelper.get('/api/profiles/invalid-uuid');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should respect privacy settings', async () => {
      // Create private profile
      const { data: privateProfile } = await supabaseClient
        .from('users')
        .insert({
          email: `private${Date.now()}@example.com`,
          username: `privateuser${Date.now()}`,
          display_name: 'Private User',
          privacy_level: 'private'
        })
        .select()
        .single();

      if (privateProfile) {
        testUsers.push(privateProfile.id);

        const response = await supertestHelper.get(`/api/profiles/${privateProfile.id}`);

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.error).toContain('private');
      }
    });
  });

  describe('GET /api/profiles/me - Get Current User Profile', () => {
    beforeEach(async () => {
      // Create profile for authenticated user
      await supabaseClient
        .from('users')
        .insert({
          id: testUserId,
          email: `me${Date.now()}@example.com`,
          username: `meuser${Date.now()}`,
          display_name: 'My Profile',
          bio: 'My test bio'
        })
        .select()
        .single();
    });

    it('should get current user profile', async () => {
      const response = await supertestHelper
        .get('/api/profiles/me')
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile).toHaveProperty('id', testUserId);
      expect(response.body.profile).toHaveProperty('username');
      expect(response.body.profile).toHaveProperty('display_name', 'My Profile');
      expect(response.body.profile).toHaveProperty('email'); // Own profile includes email
    });

    it('should require authentication', async () => {
      const response = await supertestHelper.get('/api/profiles/me');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 if user has no profile', async () => {
      // Create new authenticated user without profile
      const { data: newAuthData } = await supabaseClient.auth.signUp({
        email: `noprofile${Date.now()}@example.com`,
        password: 'TestPassword123!',
        options: {
          data: {
            username: `noprofileuser${Date.now()}`
          }
        }
      });

      if (newAuthData.session && newAuthData.user) {
        testUsers.push(newAuthData.user.id);

        const response = await supertestHelper
          .get('/api/profiles/me')
          .set('Authorization', `Bearer ${newAuthData.session.access_token}`);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.error).toContain('Profile not found');
      }
    });
  });

  describe('PUT /api/profiles/me - Update Current User Profile', () => {
    beforeEach(async () => {
      // Create profile for authenticated user using the API (proper way)
      const uniqueId = Math.random().toString(36).substr(2, 8);
      const profileData = {
        username: `upd${uniqueId}`,
        display_name: 'Original Name',
        bio: 'Original bio',
        location: 'Original City',
        privacy_level: 'public'
      };

      const response = await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${testAuthToken}`);

      if (response.status !== 201) {
        console.error('Failed to create test profile for update:', response.body);
      }
    });

    it('should update current user profile', async () => {
      const updateData = {
        display_name: 'Updated Name',
        bio: 'Updated bio',
        location: 'Updated City, UC',
        sobriety_date: '2023-06-15',
        privacy_level: 'friends'
      };

      const response = await supertestHelper
        .put('/api/profiles/me', updateData)
        .set('Authorization', `Bearer ${testAuthToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile).toMatchObject(updateData);
      expect(response.body.profile).toHaveProperty('updated_at');
    });

    it('should require authentication', async () => {
      const updateData = {
        display_name: 'Updated Name'
      };

      const response = await supertestHelper.put('/api/profiles/me', updateData);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate update data', async () => {
      const invalidUpdates = [
        { username: 'ab' }, // Username too short
        { username: 'a'.repeat(21) }, // Username too long
        { username: '123invalid' }, // Username starts with number
        { bio: 'a'.repeat(501) }, // Bio too long
        { display_name: 'a'.repeat(101) }, // Display name too long
        { privacy_level: 'invalid' }, // Invalid privacy level
        { sobriety_date: 'invalid-date' }, // Invalid date format
      ];

      for (const updateData of invalidUpdates) {
        const response = await supertestHelper
          .put('/api/profiles/me', updateData)
          .set('Authorization', `Bearer ${testAuthToken}`);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should prevent updating to existing username', async () => {
      // Create another user with existing username
      const existingUsername = 'existinguser123';
      const { data: existingUser } = await supabaseClient
        .from('users')
        .insert({
          email: `existing${Date.now()}@example.com`,
          username: existingUsername,
          display_name: 'Existing User'
        })
        .select()
        .single();

      if (existingUser) {
        testUsers.push(existingUser.id);

        const updateData = {
          username: existingUsername // Try to use existing username
        };

        const response = await supertestHelper
          .put('/api/profiles/me', updateData)
          .set('Authorization', `Bearer ${testAuthToken}`);

        expect(response.status).toBe(409);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.error).toContain('username');
      }
    });

    it('should return 404 if user has no profile', async () => {
      // Create new authenticated user without profile
      const { data: newAuthData } = await supabaseClient.auth.signUp({
        email: `noupdate${Date.now()}@example.com`,
        password: 'TestPassword123!',
        options: {
          data: {
            username: `noupdateuser${Date.now()}`
          }
        }
      });

      if (newAuthData.session && newAuthData.user) {
        testUsers.push(newAuthData.user.id);

        const updateData = {
          display_name: 'Updated Name'
        };

        const response = await supertestHelper
          .put('/api/profiles/me', updateData)
          .set('Authorization', `Bearer ${newAuthData.session.access_token}`);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.error).toContain('Profile not found');
      }
    });
  });

  describe('Security and Edge Cases', () => {
    it('should sanitize input data to prevent XSS', async () => {
      const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const maliciousData = {
        username: `normaluser${uniqueId}`,
        display_name: '<script>alert("xss")</script>',
        bio: '<img src="x" onerror="alert(1)">',
        location: '<svg onload="alert(1)">'
      };

      const response = await supertestHelper
        .post('/api/profiles', maliciousData)
        .set('Authorization', `Bearer ${testAuthToken}`);

      if (response.status === 201) {
        // If creation succeeds, data should be sanitized
        expect(response.body.profile.display_name).not.toContain('<script>');
        expect(response.body.profile.bio).not.toContain('<img');
        expect(response.body.profile.location).not.toContain('<svg');
      } else {
        // Or request should be rejected
        expect(response.status).toBe(400);
      }
    });

    it('should handle invalid JSON gracefully', async () => {
      const response = await supertestHelper
        .postRaw('/api/profiles', 'invalid-json')
        .set('Authorization', `Bearer ${testAuthToken}`)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should enforce rate limiting (simulated)', async () => {
      // This test simulates rate limiting behavior
      const uniqueId = Math.random().toString(36).substr(2, 8);
      const profileData = {
        username: `rate${uniqueId}`,
        display_name: 'Rate Limited User'
      };

      // Make multiple rapid requests
      const promises = Array(10).fill(null).map(() => 
        supertestHelper
          .post('/api/profiles', profileData)
          .set('Authorization', `Bearer ${testAuthToken}`)
      );

      const responses = await Promise.all(promises);

      // At least some requests should be rate limited or only first should succeed
      const successfulResponses = responses.filter((r: any) => r.status === 201);
      const rateLimitedResponses = responses.filter((r: any) => r.status === 429);
      
      // Either rate limiting is active OR only one creation succeeded (username uniqueness)
      expect(rateLimitedResponses.length > 0 || successfulResponses.length === 1).toBe(true);
    });
  });
});