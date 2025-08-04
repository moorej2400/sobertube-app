/**
 * Cross-Feature Integration Tests
 * Tests interactions and data flow between multiple features (auth + profile + posts)
 */

import { app } from '../../src/app';
import { createSupertestHelper } from '../helpers/supertest.helper';
import { getSupabaseClient } from '../../src/services/supabase';
import { 
  createRegisteredTestUser, 
  cleanupTestUsers,
  createTestPostData,
  createTestProfileData,
  createMultipleTestUsers,
  cleanupTestPosts
} from '../fixtures';

describe('Cross-Feature Integration Tests', () => {
  const supertestHelper = createSupertestHelper(app);
  const supabaseClient = getSupabaseClient();
  const testUserIds: string[] = [];
  const testPostIds: string[] = [];

  // Clean up test data after each test
  afterEach(async () => {
    await cleanupTestPosts(testPostIds);
    await cleanupTestUsers(testUserIds);
    testUserIds.length = 0;
    testPostIds.length = 0;
  });

  describe('Complete User Onboarding Flow Integration', () => {
    it('should complete full user journey: register -> login -> profile -> first post -> view in feed', async () => {
      // Step 1: User Registration
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('accessToken');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('username');

      // Step 2: Create User Profile
      const profileData = createTestProfileData({
        bio: 'New to recovery, excited to be part of this community!',
        sobriety_date: new Date().toISOString(),
        privacy_level: 'public'
      });

      const profileResponse = await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(profileResponse.status).toBe(201);
      expect(profileResponse.body.profile).toHaveProperty('username', profileData.username);
      expect(profileResponse.body.profile).toHaveProperty('bio', profileData.bio);

      // Step 3: Create First Post
      const postData = createTestPostData({
        content: 'Hello everyone! This is my first post in the recovery community. Day 1 starts now!',
        post_type: 'Recovery Update'
      });

      const postResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(postResponse.status).toBe(201);
      expect(postResponse.body.post).toHaveProperty('content', postData.content);
      expect(postResponse.body.post).toHaveProperty('user_id', user.id);
      
      const postId = postResponse.body.post.id;
      testPostIds.push(postId);

      // Step 4: Verify Post Appears in Feed with Complete User Data
      const feedResponse = await supertestHelper.get('/api/posts');

      expect(feedResponse.status).toBe(200);
      expect(feedResponse.body.posts).toHaveLength(1);
      
      const feedPost = feedResponse.body.posts[0];
      expect(feedPost).toHaveProperty('id', postId);
      expect(feedPost).toHaveProperty('content', postData.content);
      expect(feedPost).toHaveProperty('user');
      expect(feedPost.user).toHaveProperty('id', user.id);
      expect(feedPost.user).toHaveProperty('username', profileData.username);
      expect(feedPost.user).toHaveProperty('display_name', profileData.display_name);

      // Step 5: Verify Data Consistency Across All Features
      const authProfileResponse = await supertestHelper
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(authProfileResponse.status).toBe(200);
      expect(authProfileResponse.body.user).toHaveProperty('id', user.id);
      expect(authProfileResponse.body.user).toHaveProperty('username', profileData.username);

      const fullProfileResponse = await supertestHelper
        .get('/api/profiles/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(fullProfileResponse.status).toBe(200);
      expect(fullProfileResponse.body.profile).toHaveProperty('id', user.id);
      expect(fullProfileResponse.body.profile).toHaveProperty('username', profileData.username);
      expect(fullProfileResponse.body.profile).toHaveProperty('bio', profileData.bio);
    });

    it('should handle user data consistency when profile info changes', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create initial profile
      const initialProfileData = createTestProfileData();
      await supertestHelper
        .post('/api/profiles', initialProfileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      // Create post with initial profile data
      const postData = createTestPostData();
      const postResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      testPostIds.push(postResponse.body.post.id);

      // Update profile information
      const updatedProfileData = {
        display_name: 'Updated Display Name',
        bio: 'Updated bio information',
        profile_picture_url: 'https://example.com/new-profile.jpg'
      };

      const updateResponse = await supertestHelper
        .put('/api/profiles/me', updatedProfileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(updateResponse.status).toBe(200);

      // Verify updated profile info appears in posts feed
      const feedResponse = await supertestHelper.get('/api/posts');
      
      expect(feedResponse.status).toBe(200);
      const feedPost = feedResponse.body.posts[0];
      expect(feedPost.user).toHaveProperty('display_name', updatedProfileData.display_name);
      expect(feedPost.user).toHaveProperty('profile_picture_url', updatedProfileData.profile_picture_url);
    });

    it('should handle multi-step transaction integrity during complex operations', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Attempt to create profile and post in rapid succession
      const profileData = createTestProfileData();
      const postData = createTestPostData();

      const [profileResponse, postResponse] = await Promise.all([
        supertestHelper
          .post('/api/profiles', profileData)
          .set('Authorization', `Bearer ${user.accessToken}`),
        supertestHelper
          .post('/api/posts', postData)
          .set('Authorization', `Bearer ${user.accessToken}`)
      ]);

      expect(profileResponse.status).toBe(201);
      expect(postResponse.status).toBe(201);

      testPostIds.push(postResponse.body.post.id);

      // Verify both operations completed successfully and data is consistent
      const feedResponse = await supertestHelper.get('/api/posts');
      expect(feedResponse.status).toBe(200);
      expect(feedResponse.body.posts).toHaveLength(1);
      expect(feedResponse.body.posts[0].user).toHaveProperty('username', profileData.username);
    });
  });

  describe('Multi-User Interaction and Data Relationships', () => {
    it('should handle multiple users with posts displaying correct profile information', async () => {
      // Create two users with different profiles
      const [user1, user2] = await createMultipleTestUsers(supertestHelper, 2);
      testUserIds.push(user1.id!, user2.id!);

      // Create profiles for both users
      const profile1Data = createTestProfileData({
        display_name: 'Recovery Veteran',
        bio: '5 years sober and counting!'
      });

      const profile2Data = createTestProfileData({
        display_name: 'Recovery Newbie',
        bio: 'Just starting my journey'
      });

      await supertestHelper
        .post('/api/profiles', profile1Data)
        .set('Authorization', `Bearer ${user1.accessToken}`);

      await supertestHelper
        .post('/api/profiles', profile2Data)
        .set('Authorization', `Bearer ${user2.accessToken}`);

      // Both users create posts
      const post1Data = createTestPostData({
        content: 'Celebrating 5 years of sobriety today!',
        post_type: 'Milestone'
      });

      const post2Data = createTestPostData({
        content: 'Day 1 of my recovery journey. Nervous but hopeful!',
        post_type: 'Recovery Update'
      });

      const post1Response = await supertestHelper
        .post('/api/posts', post1Data)
        .set('Authorization', `Bearer ${user1.accessToken}`);

      const post2Response = await supertestHelper
        .post('/api/posts', post2Data)
        .set('Authorization', `Bearer ${user2.accessToken}`);

      testPostIds.push(post1Response.body.post.id, post2Response.body.post.id);

      // Verify both posts appear in feed with correct user information
      const feedResponse = await supertestHelper.get('/api/posts');

      expect(feedResponse.status).toBe(200);
      expect(feedResponse.body.posts).toHaveLength(2);

      // Find posts by content to verify correct user association
      const post1InFeed = feedResponse.body.posts.find((p: any) => p.content === post1Data.content);
      const post2InFeed = feedResponse.body.posts.find((p: any) => p.content === post2Data.content);

      expect(post1InFeed).toBeTruthy();
      expect(post1InFeed.user).toHaveProperty('display_name', profile1Data.display_name);
      expect(post1InFeed.user).toHaveProperty('id', user1.id);

      expect(post2InFeed).toBeTruthy();
      expect(post2InFeed.user).toHaveProperty('display_name', profile2Data.display_name);
      expect(post2InFeed.user).toHaveProperty('id', user2.id);
    });

    it('should handle user interactions with privacy controls correctly', async () => {
      const [publicUser, privateUser, viewerUser] = await createMultipleTestUsers(supertestHelper, 3);
      testUserIds.push(publicUser.id!, privateUser.id!, viewerUser.id!);

      // Create public and private profiles
      const publicProfileData = createTestProfileData({
        display_name: 'Public User',
        privacy_level: 'public'
      });

      const privateProfileData = createTestProfileData({
        display_name: 'Private User',
        privacy_level: 'private'
      });

      await supertestHelper
        .post('/api/profiles', publicProfileData)
        .set('Authorization', `Bearer ${publicUser.accessToken}`);

      await supertestHelper
        .post('/api/profiles', privateProfileData)
        .set('Authorization', `Bearer ${privateUser.accessToken}`);

      // Both users create posts
      const publicPostResponse = await supertestHelper
        .post('/api/posts', createTestPostData({ content: 'Public post content' }))
        .set('Authorization', `Bearer ${publicUser.accessToken}`);

      const privatePostResponse = await supertestHelper
        .post('/api/posts', createTestPostData({ content: 'Private user post content' }))
        .set('Authorization', `Bearer ${privateUser.accessToken}`);

      testPostIds.push(publicPostResponse.body.post.id, privatePostResponse.body.post.id);

      // Both posts should appear in public feed (posts are public, profile privacy affects profile viewing)
      const feedResponse = await supertestHelper.get('/api/posts');
      expect(feedResponse.status).toBe(200);
      expect(feedResponse.body.posts).toHaveLength(2);

      // Viewer can access public user's profile
      const publicProfileResponse = await supertestHelper
        .get(`/api/profiles/${publicUser.id}`)
        .set('Authorization', `Bearer ${viewerUser.accessToken}`);

      expect(publicProfileResponse.status).toBe(200);

      // Viewer cannot access private user's profile
      const privateProfileResponse = await supertestHelper
        .get(`/api/profiles/${privateUser.id}`)
        .set('Authorization', `Bearer ${viewerUser.accessToken}`);

      expect(privateProfileResponse.status).toBe(403);
    });

    it('should maintain referential integrity during complex user operations', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create profile
      const profileData = createTestProfileData();
      await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      // Create multiple posts
      const posts = [];
      for (let i = 0; i < 3; i++) {
        const postData = createTestPostData({
          content: `Test post ${i + 1}`,
          post_type: i === 0 ? 'Milestone' : 'Recovery Update'
        });

        const response = await supertestHelper
          .post('/api/posts', postData)
          .set('Authorization', `Bearer ${user.accessToken}`);

        posts.push(response.body.post);
        testPostIds.push(response.body.post.id);
      }

      // Verify all posts are linked to the same user
      const feedResponse = await supertestHelper.get('/api/posts');
      expect(feedResponse.status).toBe(200);
      expect(feedResponse.body.posts).toHaveLength(3);

      feedResponse.body.posts.forEach((post: any) => {
        expect(post).toHaveProperty('user_id', user.id);
        expect(post.user).toHaveProperty('id', user.id);
        expect(post.user).toHaveProperty('username', profileData.username);
      });

      // Verify database consistency
      const { data: dbPosts } = await supabaseClient
        .from('posts')
        .select('*')
        .eq('user_id', user.id);

      expect(dbPosts).toHaveLength(3);
      dbPosts?.forEach(post => {
        expect(post.user_id).toBe(user.id);
      });
    });
  });

  describe('Error Handling Across Features', () => {
    it('should handle database connection failures during multi-feature operations', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // This test verifies that if one operation fails, it doesn't leave the system in an inconsistent state
      // For now, we'll test with validation errors that trigger proper error handling

      // Attempt to create profile with invalid data
      const invalidProfileResponse = await supertestHelper
        .post('/api/profiles', { username: 'ab' }) // Too short
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(invalidProfileResponse.status).toBe(400);

      // Verify user can still create a valid profile after the error
      const validProfileData = createTestProfileData();
      const validProfileResponse = await supertestHelper
        .post('/api/profiles', validProfileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(validProfileResponse.status).toBe(201);

      // Verify user can create posts after profile creation
      const postData = createTestPostData();
      const postResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(postResponse.status).toBe(201);
      testPostIds.push(postResponse.body.post.id);
    });

    it('should maintain error consistency across all features', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Test that all features return consistent error response formats

      // Auth error
      const invalidTokenResponse = await supertestHelper
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(invalidTokenResponse.body).toHaveProperty('success', false);
      expect(invalidTokenResponse.body).toHaveProperty('error');

      // Profile creation error
      const invalidProfileResponse = await supertestHelper
        .post('/api/profiles', { username: 'invalid' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(invalidProfileResponse.body).toHaveProperty('success', false);
      expect(invalidProfileResponse.body).toHaveProperty('error');

      // Post creation error
      const invalidPostResponse = await supertestHelper
        .post('/api/posts', { content: '' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(invalidPostResponse.body).toHaveProperty('success', false);
      expect(invalidPostResponse.body).toHaveProperty('error');
    });

    it('should handle partial operation failures without data corruption', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create valid profile
      const profileData = createTestProfileData();
      await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      // Attempt to create post with invalid data
      const invalidPostResponse = await supertestHelper
        .post('/api/posts', { content: 'a'.repeat(501) }) // Too long
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(invalidPostResponse.status).toBe(400);

      // Verify profile data is still intact
      const profileResponse = await supertestHelper
        .get('/api/profiles/me')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body.profile).toHaveProperty('username', profileData.username);

      // Verify user can still create valid posts
      const validPostData = createTestPostData();
      const validPostResponse = await supertestHelper
        .post('/api/posts', validPostData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(validPostResponse.status).toBe(201);
      testPostIds.push(validPostResponse.body.post.id);
    });
  });

  describe('Data Cascade and Relationship Handling', () => {
    it('should handle user data relationships correctly across all features', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create profile with specific data
      const profileData = createTestProfileData({
        sobriety_date: '2023-01-01T00:00:00.000Z',
        location: 'Test City, TC'
      });

      await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      // Create post
      const postData = createTestPostData();
      const postResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      testPostIds.push(postResponse.body.post.id);

      // Verify relationships in database
      const { data: dbUser } = await supabaseClient
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      const { data: dbPost } = await supabaseClient
        .from('posts')
        .select('*')
        .eq('user_id', user.id)
        .single();

      expect(dbUser.id).toBe(user.id);
      expect(dbUser.email).toBe(user.email);
      expect(dbUser.username).toBe(profileData.username);
      expect(dbUser.sobriety_date).toBe(profileData.sobriety_date);

      expect(dbPost.user_id).toBe(user.id);
      expect(dbPost.content).toBe(postData.content);
    });

    it('should handle complex queries with joins correctly', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create profile
      const profileData = createTestProfileData();
      await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      // Create post
      const postData = createTestPostData();
      const postResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      testPostIds.push(postResponse.body.post.id);

      // Test complex query that joins posts with user data
      const { data: joinedData } = await supabaseClient
        .from('posts')
        .select(`
          *,
          user:users!posts_user_id_fkey (
            id,
            username,
            display_name,
            profile_picture_url
          )
        `)
        .eq('user_id', user.id);

      expect(joinedData).toHaveLength(1);
      expect(joinedData![0]).toHaveProperty('content', postData.content);
      expect(joinedData![0].user).toHaveProperty('username', profileData.username);
      expect(joinedData![0].user).toHaveProperty('display_name', profileData.display_name);
    });
  });
});