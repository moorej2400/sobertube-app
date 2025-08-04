/**
 * End-to-End User Journey Tests
 * Tests complete user workflows from registration to active community participation
 */

import { app } from '../../src/app';
import { createSupertestHelper } from '../helpers/supertest.helper';
import { getSupabaseClient } from '../../src/services/supabase';
import { 
  createTestUserData,
  createTestProfileData,
  createTestPostData,
  createTestPostByType,
  cleanupTestUsers,
  cleanupTestPosts
} from '../fixtures';
import { PostType } from '../../src/types/supabase';

describe('End-to-End User Journey Tests', () => {
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

  describe('New User Complete Journey', () => {
    it('should complete full new user journey: registration -> profile setup -> first post -> community interaction', async () => {
      // === PHASE 1: USER REGISTRATION ===
      const userData = createTestUserData({
        email: 'newuser@recoverjourney.com',
        username: 'recovery_newcomer',
        password: 'SecurePassword123!'
      });

      // Step 1.1: Register new account
      const registerResponse = await supertestHelper.post('/api/auth/register', userData);

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body).toHaveProperty('success', true);
      expect(registerResponse.body).toHaveProperty('emailVerificationSent', true);
      expect(registerResponse.body.user).toHaveProperty('id');
      expect(registerResponse.body.user).toHaveProperty('emailConfirmed', false);

      const userId = registerResponse.body.user.id;
      testUserIds.push(userId);

      // Step 1.2: Verify account created in database with correct relationships
      const { data: dbUser, error: dbError } = await supabaseClient
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      expect(dbError).toBeNull();
      expect(dbUser).toBeTruthy();
      expect(dbUser.email).toBe(userData.email);
      expect(dbUser.username).toBe(userData.username);

      // === PHASE 2: USER LOGIN ===
      // Step 2.1: Login with credentials
      const loginResponse = await supertestHelper.post('/api/auth/login', {
        email: userData.email,
        password: userData.password
      });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('success', true);
      expect(loginResponse.body).toHaveProperty('authenticated', true);
      expect(loginResponse.body).toHaveProperty('accessToken');
      expect(loginResponse.body).toHaveProperty('refreshToken');

      const { accessToken, refreshToken } = loginResponse.body;

      // Step 2.2: Verify authentication works
      const profileAuthResponse = await supertestHelper
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(profileAuthResponse.status).toBe(200);
      expect(profileAuthResponse.body.user).toHaveProperty('id', userId);

      // === PHASE 3: PROFILE SETUP ===
      // Step 3.1: Create detailed user profile
      const profileData = createTestProfileData({
        username: userData.username,
        display_name: 'Sarah Johnson',
        bio: 'New to recovery, taking it one day at a time. Grateful for this supportive community.',
        location: 'Portland, OR',
        sobriety_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        privacy_level: 'public'
      });

      const createProfileResponse = await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(createProfileResponse.status).toBe(201);
      expect(createProfileResponse.body).toHaveProperty('success', true);
      expect(createProfileResponse.body.profile).toHaveProperty('username', profileData.username);
      expect(createProfileResponse.body.profile).toHaveProperty('display_name', profileData.display_name);

      // Step 3.2: Verify profile can be retrieved
      const getProfileResponse = await supertestHelper
        .get('/api/profiles/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getProfileResponse.status).toBe(200);
      expect(getProfileResponse.body.profile).toHaveProperty('bio', profileData.bio);
      expect(getProfileResponse.body.profile).toHaveProperty('sobriety_date', profileData.sobriety_date);

      // === PHASE 4: FIRST POST CREATION ===
      // Step 4.1: Create first recovery post
      const firstPostData = createTestPostData({
        content: 'Hello everyone! This is my first post here. I\'m 30 days sober today and wanted to share my gratitude for finding this community. The journey hasn\'t been easy, but having a place to connect with others who understand makes all the difference. Looking forward to supporting each other!',
        post_type: 'Recovery Update'
      });

      const firstPostResponse = await supertestHelper
        .post('/api/posts', firstPostData)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(firstPostResponse.status).toBe(201);
      expect(firstPostResponse.body).toHaveProperty('success', true);
      expect(firstPostResponse.body.post).toHaveProperty('content', firstPostData.content);
      expect(firstPostResponse.body.post).toHaveProperty('user_id', userId);
      expect(firstPostResponse.body.post).toHaveProperty('likes_count', 0);
      expect(firstPostResponse.body.post).toHaveProperty('comments_count', 0);

      const firstPostId = firstPostResponse.body.post.id;
      testPostIds.push(firstPostId);

      // Step 4.2: Verify post appears in public feed with complete user information
      const initialFeedResponse = await supertestHelper.get('/api/posts');

      expect(initialFeedResponse.status).toBe(200);
      expect(initialFeedResponse.body.posts).toHaveLength(1);
      
      const feedPost = initialFeedResponse.body.posts[0];
      expect(feedPost).toHaveProperty('id', firstPostId);
      expect(feedPost).toHaveProperty('content', firstPostData.content);
      expect(feedPost).toHaveProperty('user');
      expect(feedPost.user).toHaveProperty('id', userId);
      expect(feedPost.user).toHaveProperty('username', profileData.username);
      expect(feedPost.user).toHaveProperty('display_name', profileData.display_name);

      // === PHASE 5: ONGOING COMMUNITY PARTICIPATION ===
      // Step 5.1: Create milestone post after some time
      await new Promise(resolve => setTimeout(resolve, 50)); // Ensure different timestamp

      const milestonePostData = createTestPostByType('Milestone', 
        'One month milestone reached! 🎉 Thank you to everyone who has shown support. The encouragement from this community has been incredible.');

      const milestonePostResponse = await supertestHelper
        .post('/api/posts', milestonePostData)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(milestonePostResponse.status).toBe(201);
      testPostIds.push(milestonePostResponse.body.post.id);

      // Step 5.2: Create inspirational post
      await new Promise(resolve => setTimeout(resolve, 50));

      const inspirationPostData = createTestPostByType('Inspiration',
        'Recovery isn\'t about perfection, it\'s about progress. Every day we choose sobriety is a victory worth celebrating.');

      const inspirationPostResponse = await supertestHelper
        .post('/api/posts', inspirationPostData)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(inspirationPostResponse.status).toBe(201);
      testPostIds.push(inspirationPostResponse.body.post.id);

      // Step 5.3: Verify all posts appear in feed in correct order
      const finalFeedResponse = await supertestHelper.get('/api/posts');

      expect(finalFeedResponse.status).toBe(200);
      expect(finalFeedResponse.body.posts).toHaveLength(3);

      // Verify posts are in reverse chronological order
      const posts = finalFeedResponse.body.posts;
      expect(posts[0]).toHaveProperty('post_type', 'Inspiration'); // Most recent
      expect(posts[1]).toHaveProperty('post_type', 'Milestone');   // Middle
      expect(posts[2]).toHaveProperty('post_type', 'Recovery Update'); // Oldest

      // Verify all posts have consistent user information
      posts.forEach(post => {
        expect(post.user).toHaveProperty('id', userId);
        expect(post.user).toHaveProperty('username', profileData.username);
        expect(post.user).toHaveProperty('display_name', profileData.display_name);
      });

      // === PHASE 6: PROFILE EVOLUTION ===
      // Step 6.1: Update profile as user grows in recovery
      const profileUpdateData = {
        bio: 'One month sober and counting! This community has been my lifeline. Here to support others on their journey too.',
        display_name: 'Sarah J. - 1 Month Strong'
      };

      const updateProfileResponse = await supertestHelper
        .put('/api/profiles/me', profileUpdateData)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(updateProfileResponse.status).toBe(200);
      expect(updateProfileResponse.body.profile).toHaveProperty('bio', profileUpdateData.bio);
      expect(updateProfileResponse.body.profile).toHaveProperty('display_name', profileUpdateData.display_name);

      // Step 6.2: Verify updated profile information reflects in posts
      const updatedFeedResponse = await supertestHelper.get('/api/posts');
      
      expect(updatedFeedResponse.status).toBe(200);
      updatedFeedResponse.body.posts.forEach(post => {
        expect(post.user).toHaveProperty('display_name', profileUpdateData.display_name);
      });

      // === PHASE 7: TOKEN MANAGEMENT ===
      // Step 7.1: Test token refresh for long session
      const refreshResponse = await supertestHelper.post('/api/auth/refresh', {
        refreshToken: refreshToken
      });

      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body).toHaveProperty('accessToken');
      expect(refreshResponse.body).toHaveProperty('refreshToken');

      const newAccessToken = refreshResponse.body.accessToken;

      // Step 7.2: Verify new token works for authenticated operations
      const newTokenTestResponse = await supertestHelper
        .get('/api/profiles/me')
        .set('Authorization', `Bearer ${newAccessToken}`);

      expect(newTokenTestResponse.status).toBe(200);
      expect(newTokenTestResponse.body.profile).toHaveProperty('id', userId);
    });
  });

  describe('Multi-User Community Interaction Journey', () => {
    it('should simulate realistic community interaction between multiple users', async () => {
      // === CREATE COMMUNITY USERS ===
      const users = [];

      // Veteran user (2 years sober)
      const veteranUserData = createTestUserData({
        email: 'veteran@recovery.com',
        username: 'recovery_veteran'
      });

      const veteranRegisterResponse = await supertestHelper.post('/api/auth/register', veteranUserData);
      const veteranLoginResponse = await supertestHelper.post('/api/auth/login', {
        email: veteranUserData.email,
        password: veteranUserData.password
      });

      users.push({
        id: veteranRegisterResponse.body.user.id,
        token: veteranLoginResponse.body.accessToken,
        username: veteranUserData.username,
        type: 'veteran'
      });

      testUserIds.push(veteranRegisterResponse.body.user.id);

      // Newcomer user (30 days)
      const newcomerUserData = createTestUserData({
        email: 'newcomer@recovery.com',
        username: 'recovery_newcomer'
      });

      const newcomerRegisterResponse = await supertestHelper.post('/api/auth/register', newcomerUserData);
      const newcomerLoginResponse = await supertestHelper.post('/api/auth/login', {
        email: newcomerUserData.email,
        password: newcomerUserData.password
      });

      users.push({
        id: newcomerRegisterResponse.body.user.id,
        token: newcomerLoginResponse.body.accessToken,
        username: newcomerUserData.username,
        type: 'newcomer'
      });

      testUserIds.push(newcomerRegisterResponse.body.user.id);

      // Support person (family member)
      const supportUserData = createTestUserData({
        email: 'support@recovery.com',
        username: 'caring_support'
      });

      const supportRegisterResponse = await supertestHelper.post('/api/auth/register', supportUserData);
      const supportLoginResponse = await supertestHelper.post('/api/auth/login', {
        email: supportUserData.email,
        password: supportUserData.password
      });

      users.push({
        id: supportRegisterResponse.body.user.id,
        token: supportLoginResponse.body.accessToken,
        username: supportUserData.username,
        type: 'support'
      });

      testUserIds.push(supportRegisterResponse.body.user.id);

      // === CREATE PROFILES FOR ALL USERS ===
      const veteranProfile = createTestProfileData({
        username: users[0].username,
        display_name: 'Michael R.',
        bio: '2 years sober. Here to help others on their journey.',
        sobriety_date: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString()
      });

      const newcomerProfile = createTestProfileData({
        username: users[1].username,
        display_name: 'Emma K.',
        bio: '30 days clean. Taking it one day at a time.',
        sobriety_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      });

      const supportProfile = createTestProfileData({
        username: users[2].username,
        display_name: 'Linda S.',
        bio: 'Supporting my son in recovery. Learning how to help.',
        privacy_level: 'public'
      });

      await supertestHelper
        .post('/api/profiles', veteranProfile)
        .set('Authorization', `Bearer ${users[0].token}`);

      await supertestHelper
        .post('/api/profiles', newcomerProfile)
        .set('Authorization', `Bearer ${users[1].token}`);

      await supertestHelper
        .post('/api/profiles', supportProfile)
        .set('Authorization', `Bearer ${users[2].token}`);

      // === SIMULATE COMMUNITY INTERACTION ===
      // Veteran shares milestone
      const veteranMilestoneResponse = await supertestHelper
        .post('/api/posts', createTestPostByType('Milestone', 
          'Two years sober today! To anyone just starting: it gets easier. The first 90 days are the hardest, but every day after that is a gift. Keep going!'))
        .set('Authorization', `Bearer ${users[0].token}`);

      testPostIds.push(veteranMilestoneResponse.body.post.id);

      // Newcomer asks for help
      await new Promise(resolve => setTimeout(resolve, 50));
      const newcomerQuestionResponse = await supertestHelper
        .post('/api/posts', createTestPostByType('Question',
          'Having a tough day today. The cravings are strong. How do you all handle the difficult moments? Any advice would be appreciated.'))
        .set('Authorization', `Bearer ${users[1].token}`);

      testPostIds.push(newcomerQuestionResponse.body.post.id);

      // Support person shares gratitude
      await new Promise(resolve => setTimeout(resolve, 50));
      const supportGratitudeResponse = await supertestHelper
        .post('/api/posts', createTestPostByType('Gratitude',
          'Grateful for this community that has helped my son find his path to recovery. Seeing the support here gives me hope every day.'))
        .set('Authorization', `Bearer ${users[2].token}`);

      testPostIds.push(supportGratitudeResponse.body.post.id);

      // Veteran responds with inspiration
      await new Promise(resolve => setTimeout(resolve, 50));
      const veteranInspirationResponse = await supertestHelper
        .post('/api/posts', createTestPostByType('Inspiration',
          'Remember: You are stronger than your addiction. Every moment you choose recovery is a moment you choose life. We\'re all here for each other.'))
        .set('Authorization', `Bearer ${users[0].token}`);

      testPostIds.push(veteranInspirationResponse.body.post.id);

      // === VERIFY COMMUNITY FEED ===
      const communityFeedResponse = await supertestHelper.get('/api/posts');

      expect(communityFeedResponse.status).toBe(200);
      expect(communityFeedResponse.body.posts).toHaveLength(4);

      // Verify diversity of post types and users
      const posts = communityFeedResponse.body.posts;
      const postTypes = posts.map(p => p.post_type);
      const userIds = posts.map(p => p.user_id);

      expect(postTypes).toContain('Milestone');
      expect(postTypes).toContain('Question');
      expect(postTypes).toContain('Gratitude');
      expect(postTypes).toContain('Inspiration');

      expect(new Set(userIds)).toHaveProperty('size', 3); // All three users posted

      // Verify user information is correct for each post
      posts.forEach(post => {
        const user = users.find(u => u.id === post.user_id);
        expect(post.user).toHaveProperty('username', user.username);
      });

      // === VERIFY CROSS-USER PROFILE VIEWING ===
      // Newcomer views veteran's profile for inspiration
      const veteranProfileViewResponse = await supertestHelper
        .get(`/api/profiles/${users[0].id}`)
        .set('Authorization', `Bearer ${users[1].token}`);

      expect(veteranProfileViewResponse.status).toBe(200);
      expect(veteranProfileViewResponse.body.profile).toHaveProperty('display_name', veteranProfile.display_name);
      expect(veteranProfileViewResponse.body.profile).toHaveProperty('bio', veteranProfile.bio);

      // Support person views newcomer's profile
      const newcomerProfileViewResponse = await supertestHelper
        .get(`/api/profiles/${users[1].id}`)
        .set('Authorization', `Bearer ${users[2].token}`);

      expect(newcomerProfileViewResponse.status).toBe(200);
      expect(newcomerProfileViewResponse.body.profile).toHaveProperty('display_name', newcomerProfile.display_name);
    });
  });

  describe('Privacy and Security Journey', () => {
    it('should demonstrate complete privacy control workflow', async () => {
      // Create user who wants to manage privacy settings
      const userData = createTestUserData({
        email: 'privacy@recovery.com',
        username: 'privacy_conscious'
      });

      const registerResponse = await supertestHelper.post('/api/auth/register', userData);
      const loginResponse = await supertestHelper.post('/api/auth/login', {
        email: userData.email,
        password: userData.password
      });

      const userId = registerResponse.body.user.id;
      const accessToken = loginResponse.body.accessToken;
      testUserIds.push(userId);

      // Create viewer user
      const viewerData = createTestUserData({
        email: 'viewer@recovery.com',
        username: 'profile_viewer'
      });

      const viewerRegisterResponse = await supertestHelper.post('/api/auth/register', viewerData);
      const viewerLoginResponse = await supertestHelper.post('/api/auth/login', {
        email: viewerData.email,
        password: viewerData.password
      });

      const viewerToken = viewerLoginResponse.body.accessToken;
      testUserIds.push(viewerRegisterResponse.body.user.id);

      // === PHASE 1: START WITH PRIVATE PROFILE ===
      const privateProfileData = createTestProfileData({
        username: userData.username,
        display_name: 'Anonymous User',
        bio: 'Keeping my recovery journey private for now.',
        privacy_level: 'private'
      });

      await supertestHelper
        .post('/api/profiles', privateProfileData)
        .set('Authorization', `Bearer ${accessToken}`);

      // Create private post
      const privatePostResponse = await supertestHelper
        .post('/api/posts', createTestPostData({
          content: 'Starting my recovery journey. Not ready to be fully public yet.',
          post_type: 'Recovery Update'
        }))
        .set('Authorization', `Bearer ${accessToken}`);

      testPostIds.push(privatePostResponse.body.post.id);

      // Verify other users cannot access private profile
      const privateViewAttemptResponse = await supertestHelper
        .get(`/api/profiles/${userId}`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(privateViewAttemptResponse.status).toBe(403);
      expect(privateViewAttemptResponse.body.error).toContain('private');

      // === PHASE 2: TRANSITION TO PUBLIC PROFILE ===
      // User decides to become more open about their journey
      const publicUpdateResponse = await supertestHelper
        .put('/api/profiles/me', {
          display_name: 'Sarah M.',
          bio: 'Ready to share my recovery journey and help others. 6 months sober!',
          privacy_level: 'public'
        })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(publicUpdateResponse.status).toBe(200);
      expect(publicUpdateResponse.body.profile).toHaveProperty('privacy_level', 'public');

      // Create public post celebrating the decision
      const publicPostResponse = await supertestHelper
        .post('/api/posts', createTestPostData({
          content: 'Ready to be more open about my recovery journey! Looking forward to connecting with this amazing community.',
          post_type: 'Recovery Update'
        }))
        .set('Authorization', `Bearer ${accessToken}`);

      testPostIds.push(publicPostResponse.body.post.id);

      // === PHASE 3: VERIFY PUBLIC ACCESS ===
      // Now other users can access the profile
      const publicViewResponse = await supertestHelper
        .get(`/api/profiles/${userId}`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(publicViewResponse.status).toBe(200);
      expect(publicViewResponse.body.profile).toHaveProperty('display_name', 'Sarah M.');
      expect(publicViewResponse.body.profile).toHaveProperty('privacy_level', 'public');

      // Anonymous users can also access public profile
      const anonymousViewResponse = await supertestHelper.get(`/api/profiles/${userId}`);
      expect(anonymousViewResponse.status).toBe(200);

      // === PHASE 4: VERIFY POSTS REMAIN PUBLIC REGARDLESS OF PROFILE PRIVACY ===
      // Both posts should appear in public feed (posts are always public)
      const feedResponse = await supertestHelper.get('/api/posts');
      expect(feedResponse.status).toBe(200);
      expect(feedResponse.body.posts).toHaveLength(2);

      // Verify user information is correctly displayed
      feedResponse.body.posts.forEach(post => {
        expect(post.user).toHaveProperty('id', userId);
        expect(post.user).toHaveProperty('username', userData.username);
      });
    });
  });

  describe('Error Recovery and Resilience Journey', () => {
    it('should demonstrate system resilience during user journey with intermittent failures', async () => {
      // Create user
      const userData = createTestUserData({
        email: 'resilient@recovery.com',
        username: 'resilient_user'
      });

      const registerResponse = await supertestHelper.post('/api/auth/register', userData);
      const loginResponse = await supertestHelper.post('/api/auth/login', {
        email: userData.email,
        password: userData.password
      });

      const userId = registerResponse.body.user.id;
      const accessToken = loginResponse.body.accessToken;
      testUserIds.push(userId);

      // === PHASE 1: PROFILE CREATION WITH RETRY ===
      // First attempt with invalid data (simulate user error)
      const invalidProfileResponse = await supertestHelper
        .post('/api/profiles', { username: 'ab' }) // Too short
        .set('Authorization', `Bearer ${accessToken}`);

      expect(invalidProfileResponse.status).toBe(400);

      // User corrects the error and tries again
      const validProfileData = createTestProfileData({
        username: userData.username,
        display_name: 'Resilient User'
      });

      const validProfileResponse = await supertestHelper
        .post('/api/profiles', validProfileData)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(validProfileResponse.status).toBe(201);

      // === PHASE 2: POST CREATION WITH VALIDATION ERRORS ===
      // User tries to post with invalid content
      const invalidPostResponse = await supertestHelper
        .post('/api/posts', { content: '' }) // Empty content
        .set('Authorization', `Bearer ${accessToken}`);

      expect(invalidPostResponse.status).toBe(400);

      // User fixes the content and posts successfully
      const validPostData = createTestPostData({
        content: 'Learning from my mistakes and staying resilient in recovery!'
      });

      const validPostResponse = await supertestHelper
        .post('/api/posts', validPostData)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(validPostResponse.status).toBe(201);
      testPostIds.push(validPostResponse.body.post.id);

      // === PHASE 3: VERIFY SYSTEM STATE REMAINS CONSISTENT ===
      // Check that profile is still accessible
      const profileCheckResponse = await supertestHelper
        .get('/api/profiles/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(profileCheckResponse.status).toBe(200);
      expect(profileCheckResponse.body.profile).toHaveProperty('username', validProfileData.username);

      // Check that post appears in feed
      const feedCheckResponse = await supertestHelper.get('/api/posts');
      expect(feedCheckResponse.status).toBe(200);
      expect(feedCheckResponse.body.posts).toHaveLength(1);
      expect(feedCheckResponse.body.posts[0]).toHaveProperty('content', validPostData.content);

      // === PHASE 4: VERIFY AUTHENTICATION REMAINS STABLE ===
      const authCheckResponse = await supertestHelper
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(authCheckResponse.status).toBe(200);
      expect(authCheckResponse.body.user).toHaveProperty('id', userId);
    });
  });
});