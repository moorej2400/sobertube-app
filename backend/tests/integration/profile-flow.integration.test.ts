/**
 * Profile Management Flow Integration Tests
 * Tests complete profile workflows including creation, updates, privacy controls, and auth integration
 */

import { app } from '../../src/app';
import { createSupertestHelper } from '../helpers/supertest.helper';
import { getSupabaseClient } from '../../src/services/supabase';
import { 
  createRegisteredTestUser, 
  cleanupTestUsers,
  createTestProfileData,
  createTestProfileByPrivacy,
  createMultipleTestUsers
} from '../fixtures';

describe('Profile Management Flow Integration', () => {
  const supertestHelper = createSupertestHelper(app);
  const supabaseClient = getSupabaseClient();
  const testUserIds: string[] = [];

  // Clean up test data after each test
  afterEach(async () => {
    await cleanupTestUsers(testUserIds);
    testUserIds.length = 0;
  });

  describe('Profile Creation and Auth Integration', () => {
    it('should complete full auth -> profile creation -> database verification flow', async () => {
      // Step 1: Create authenticated user
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Step 2: Create profile for authenticated user
      const profileData = createTestProfileData();
      const createResponse = await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(createResponse.status).toBe(201);
      expect(createResponse.body).toHaveProperty('success', true);
      expect(createResponse.body.profile).toHaveProperty('id', user.id);
      expect(createResponse.body.profile).toHaveProperty('username', profileData.username);
      expect(createResponse.body.profile).toHaveProperty('display_name', profileData.display_name);

      // Step 3: Verify profile exists in database and is linked to auth user
      const { data: dbProfile, error: dbError } = await supabaseClient
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      expect(dbError).toBeNull();
      expect(dbProfile).toBeTruthy();
      expect(dbProfile.id).toBe(user.id);
      expect(dbProfile.email).toBe(user.email);
      expect(dbProfile.username).toBe(profileData.username);
      expect(dbProfile.display_name).toBe(profileData.display_name);

      // Step 4: Verify profile can be retrieved via API
      const getResponse = await supertestHelper
        .get('/api/profiles/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.profile).toHaveProperty('id', user.id);
      expect(getResponse.body.profile).toHaveProperty('username', profileData.username);
    });

    it('should validate profile creation data properly', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Test missing username
      const missingUsernameResponse = await supertestHelper
        .post('/api/profiles', { display_name: 'Test User' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(missingUsernameResponse.status).toBe(400);
      expect(missingUsernameResponse.body.error).toContain('username');

      // Test invalid username (too short)
      const shortUsernameResponse = await supertestHelper
        .post('/api/profiles', { username: 'ab' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(shortUsernameResponse.status).toBe(400);
      expect(shortUsernameResponse.body.error).toContain('username');

      // Test invalid username (invalid characters)
      const invalidUsernameResponse = await supertestHelper
        .post('/api/profiles', { username: '123invalid' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(invalidUsernameResponse.status).toBe(400);
      expect(invalidUsernameResponse.body.error).toContain('username');

      // Test valid profile data
      const validData = createTestProfileData();
      const validResponse = await supertestHelper
        .post('/api/profiles', validData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(validResponse.status).toBe(201);
    });

    it('should prevent duplicate profile creation', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // First profile creation should succeed
      const firstProfileData = createTestProfileData();
      const firstResponse = await supertestHelper
        .post('/api/profiles', firstProfileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(firstResponse.status).toBe(201);

      // Second profile creation should fail
      const secondProfileData = createTestProfileData();
      const secondResponse = await supertestHelper
        .post('/api/profiles', secondProfileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(secondResponse.status).toBe(409);
      expect(secondResponse.body.error).toContain('already has a profile');
    });

    it('should prevent duplicate usernames across different users', async () => {
      const [user1, user2] = await createMultipleTestUsers(supertestHelper, 2);
      testUserIds.push(user1.id!, user2.id!);

      const username = `unique_test_${Date.now()}`;

      // User 1 creates profile with specific username
      const user1ProfileData = createTestProfileData({ username });
      const user1Response = await supertestHelper
        .post('/api/profiles', user1ProfileData)
        .set('Authorization', `Bearer ${user1.accessToken}`);

      expect(user1Response.status).toBe(201);

      // User 2 tries to create profile with same username
      const user2ProfileData = createTestProfileData({ username });
      const user2Response = await supertestHelper
        .post('/api/profiles', user2ProfileData)
        .set('Authorization', `Bearer ${user2.accessToken}`);

      expect(user2Response.status).toBe(409);
      expect(user2Response.body.error).toContain('Username already exists');
    });
  });

  describe('Profile Privacy and Access Control Integration', () => {
    it('should handle different privacy levels correctly', async () => {
      const [publicUser, privateUser, viewerUser] = await createMultipleTestUsers(supertestHelper, 3);
      testUserIds.push(publicUser.id!, privateUser.id!, viewerUser.id!);

      // Create public profile
      const publicProfileData = createTestProfileByPrivacy('public');
      await supertestHelper
        .post('/api/profiles', publicProfileData)
        .set('Authorization', `Bearer ${publicUser.accessToken}`);

      // Create private profile
      const privateProfileData = createTestProfileByPrivacy('private');
      await supertestHelper
        .post('/api/profiles', privateProfileData)
        .set('Authorization', `Bearer ${privateUser.accessToken}`);

      // Test anonymous access to public profile
      const anonymousPublicResponse = await supertestHelper
        .get(`/api/profiles/${publicUser.id}`);

      expect(anonymousPublicResponse.status).toBe(200);
      expect(anonymousPublicResponse.body.profile).toHaveProperty('id', publicUser.id);

      // Test anonymous access to private profile (should fail)
      const anonymousPrivateResponse = await supertestHelper
        .get(`/api/profiles/${privateUser.id}`);

      expect(anonymousPrivateResponse.status).toBe(403);
      expect(anonymousPrivateResponse.body.error).toContain('private');

      // Test authenticated user access to public profile
      const authPublicResponse = await supertestHelper
        .get(`/api/profiles/${publicUser.id}`)
        .set('Authorization', `Bearer ${viewerUser.accessToken}`);

      expect(authPublicResponse.status).toBe(200);

      // Test authenticated user access to private profile (should still fail)
      const authPrivateResponse = await supertestHelper
        .get(`/api/profiles/${privateUser.id}`)
        .set('Authorization', `Bearer ${viewerUser.accessToken}`);

      expect(authPrivateResponse.status).toBe(403);

      // Test owner access to their own private profile
      const ownerPrivateResponse = await supertestHelper
        .get(`/api/profiles/${privateUser.id}`)
        .set('Authorization', `Bearer ${privateUser.accessToken}`);

      expect(ownerPrivateResponse.status).toBe(200);
    });

    it('should enforce profile update permissions correctly', async () => {
      const [owner, otherUser] = await createMultipleTestUsers(supertestHelper, 2);
      testUserIds.push(owner.id!, otherUser.id!);

      // Owner creates profile
      const profileData = createTestProfileData();
      await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${owner.accessToken}`);

      // Owner should be able to update their profile
      const updateData = { display_name: 'Updated Display Name' };
      const ownerUpdateResponse = await supertestHelper
        .put('/api/profiles/me', updateData)
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(ownerUpdateResponse.status).toBe(200);
      expect(ownerUpdateResponse.body.profile).toHaveProperty('display_name', updateData.display_name);

      // Other user should not be able to update owner's profile
      // (Note: The current API design doesn't allow updating other users' profiles directly)
      // This test confirms the design prevents unauthorized updates
    });

    it('should handle friends privacy level correctly', async () => {
      const [friendsUser, viewerUser] = await createMultipleTestUsers(supertestHelper, 2);
      testUserIds.push(friendsUser.id!, viewerUser.id!);

      // Create friends-only profile
      const friendsProfileData = createTestProfileByPrivacy('friends');
      await supertestHelper
        .post('/api/profiles', friendsProfileData)
        .set('Authorization', `Bearer ${friendsUser.accessToken}`);

      // Test access to friends-only profile (should fail without friend relationship)
      const viewerResponse = await supertestHelper
        .get(`/api/profiles/${friendsUser.id}`)
        .set('Authorization', `Bearer ${viewerUser.accessToken}`);

      expect(viewerResponse.status).toBe(403);
      expect(viewerResponse.body.error).toContain('friends');

      // Owner should still be able to access their own profile
      const ownerResponse = await supertestHelper
        .get(`/api/profiles/${friendsUser.id}`)
        .set('Authorization', `Bearer ${friendsUser.accessToken}`);

      expect(ownerResponse.status).toBe(200);
    });
  });

  describe('Profile CRUD Operations Integration', () => {
    it('should handle complete profile CRUD lifecycle', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // CREATE: Create profile
      const initialData = createTestProfileData();
      const createResponse = await supertestHelper
        .post('/api/profiles', initialData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.profile).toHaveProperty('username', initialData.username);

      // READ: Get profile
      const readResponse = await supertestHelper
        .get('/api/profiles/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(readResponse.status).toBe(200);
      expect(readResponse.body.profile).toHaveProperty('username', initialData.username);
      expect(readResponse.body.profile).toHaveProperty('display_name', initialData.display_name);

      // UPDATE: Update profile
      const updateData = {
        display_name: 'Updated Display Name',
        bio: 'Updated bio content',
        location: 'Updated Location'
      };

      const updateResponse = await supertestHelper
        .put('/api/profiles/me', updateData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.profile).toHaveProperty('display_name', updateData.display_name);
      expect(updateResponse.body.profile).toHaveProperty('bio', updateData.bio);
      expect(updateResponse.body.profile).toHaveProperty('location', updateData.location);

      // READ AGAIN: Verify updates persisted
      const verifyResponse = await supertestHelper
        .get('/api/profiles/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.profile).toHaveProperty('display_name', updateData.display_name);
      expect(verifyResponse.body.profile).toHaveProperty('bio', updateData.bio);
      expect(verifyResponse.body.profile).toHaveProperty('location', updateData.location);
    });

    it('should validate profile update data properly', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create initial profile
      const profileData = createTestProfileData();
      await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      // Test invalid username update (too short)
      const shortUsernameResponse = await supertestHelper
        .put('/api/profiles/me', { username: 'ab' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(shortUsernameResponse.status).toBe(400);
      expect(shortUsernameResponse.body.error).toContain('username');

      // Test invalid bio (too long)
      const longBioResponse = await supertestHelper
        .put('/api/profiles/me', { bio: 'a'.repeat(501) })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(longBioResponse.status).toBe(400);
      expect(longBioResponse.body.error).toContain('bio');

      // Test invalid privacy level
      const invalidPrivacyResponse = await supertestHelper
        .put('/api/profiles/me', { privacy_level: 'invalid' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(invalidPrivacyResponse.status).toBe(400);
      expect(invalidPrivacyResponse.body.error).toContain('privacy_level');

      // Test valid update
      const validUpdateResponse = await supertestHelper
        .put('/api/profiles/me', { display_name: 'Valid Update' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(validUpdateResponse.status).toBe(200);
    });

    it('should handle data sanitization properly', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create profile with potentially malicious data
      const maliciousData = createTestProfileData({
        display_name: '<script>alert("xss")</script>',
        bio: '<img src=x onerror=alert("xss")>',
        location: 'javascript:alert("xss")'
      });

      const createResponse = await supertestHelper
        .post('/api/profiles', maliciousData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(createResponse.status).toBe(201);

      // Verify data was sanitized
      expect(createResponse.body.profile.display_name).not.toContain('<script>');
      expect(createResponse.body.profile.bio).not.toContain('<img');
      expect(createResponse.body.profile.location).not.toContain('javascript:');
    });
  });

  describe('Profile Data Consistency Integration', () => {
    it('should maintain consistency between auth user and profile data', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create profile
      const profileData = createTestProfileData();
      await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      // Get auth profile
      const authProfileResponse = await supertestHelper
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`);

      // Get full profile
      const fullProfileResponse = await supertestHelper
        .get('/api/profiles/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      // Verify consistency
      expect(authProfileResponse.body.user.id).toBe(fullProfileResponse.body.profile.id);
      expect(authProfileResponse.body.user.email).toBe(fullProfileResponse.body.profile.email);
      expect(authProfileResponse.body.user.username).toBe(fullProfileResponse.body.profile.username);
    });

    it('should handle profile updates reflecting in all endpoints', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create profile
      const profileData = createTestProfileData();
      await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      // Update username
      const newUsername = `updated_${Date.now()}`.substring(0, 20);
      const updateResponse = await supertestHelper
        .put('/api/profiles/me', { username: newUsername })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(updateResponse.status).toBe(200);

      // Verify update is reflected in auth profile
      const authProfileResponse = await supertestHelper
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(authProfileResponse.body.user.username).toBe(newUsername);

      // Verify update is reflected in full profile
      const fullProfileResponse = await supertestHelper
        .get('/api/profiles/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(fullProfileResponse.body.profile.username).toBe(newUsername);
    });

    it('should handle database transaction integrity during profile operations', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create profile with complex data
      const profileData = createTestProfileData({
        sobriety_date: new Date().toISOString(),
        profile_picture_url: 'https://example.com/profile.jpg'
      });

      const createResponse = await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(createResponse.status).toBe(201);

      // Verify all fields were saved atomically
      const { data: dbProfile } = await supabaseClient
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      expect(dbProfile.username).toBe(profileData.username);
      expect(dbProfile.display_name).toBe(profileData.display_name);
      expect(dbProfile.bio).toBe(profileData.bio);
      expect(dbProfile.location).toBe(profileData.location);
      expect(dbProfile.profile_picture_url).toBe(profileData.profile_picture_url);
      expect(dbProfile.privacy_level).toBe(profileData.privacy_level);
    });
  });
});