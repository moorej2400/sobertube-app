/**
 * Posts System Flow Integration Tests
 * Tests complete posts workflows including CRUD operations, authentication integration, and user relationships
 */

import { app } from '../../src/app';
import { createSupertestHelper } from '../helpers/supertest.helper';
import { getSupabaseClient } from '../../src/services/supabase';
import { 
  createRegisteredTestUser, 
  cleanupTestUsers,
  createTestPostData,
  createTestPostByType,
  createMultipleTestUsers,
  createTestProfileData,
  cleanupTestPosts
} from '../fixtures';
import { PostType } from '../../src/types/supabase';

describe('Posts System Flow Integration', () => {
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

  describe('Posts Creation and Authentication Integration', () => {
    it('should complete full auth -> post creation -> database verification flow', async () => {
      // Step 1: Create authenticated user
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Step 2: Create post with authentication
      const postData = createTestPostData();
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(createResponse.status).toBe(201);
      expect(createResponse.body).toHaveProperty('success', true);
      expect(createResponse.body.post).toHaveProperty('id');
      expect(createResponse.body.post).toHaveProperty('user_id', user.id);
      expect(createResponse.body.post).toHaveProperty('content', postData.content);
      expect(createResponse.body.post).toHaveProperty('post_type', postData.post_type);

      const postId = createResponse.body.post.id;
      testPostIds.push(postId);

      // Step 3: Verify post exists in database with correct user relationship
      const { data: dbPost, error: dbError } = await supabaseClient
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();

      expect(dbError).toBeNull();
      expect(dbPost).toBeTruthy();
      expect(dbPost.user_id).toBe(user.id);
      expect(dbPost.content).toBe(postData.content);
      expect(dbPost.post_type).toBe(postData.post_type);
      expect(dbPost.likes_count).toBe(0);
      expect(dbPost.comments_count).toBe(0);

      // Step 4: Verify post appears in public feed
      const feedResponse = await supertestHelper.get('/api/posts');
      expect(feedResponse.status).toBe(200);
      expect(feedResponse.body.posts).toHaveLength(1);
      expect(feedResponse.body.posts[0]).toHaveProperty('id', postId);
      expect(feedResponse.body.posts[0]).toHaveProperty('user_id', user.id);
    });

    it('should prevent unauthenticated post creation', async () => {
      const postData = createTestPostData();

      const response = await supertestHelper.post('/api/posts', postData);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate post creation data properly', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Test missing content
      const missingContentResponse = await supertestHelper
        .post('/api/posts', { post_type: 'Recovery Update' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(missingContentResponse.status).toBe(400);
      expect(missingContentResponse.body.error).toContain('content is required');

      // Test empty content
      const emptyContentResponse = await supertestHelper
        .post('/api/posts', { content: '   ', post_type: 'Recovery Update' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(emptyContentResponse.status).toBe(400);
      expect(emptyContentResponse.body.error).toContain('content cannot be empty');

      // Test content too long
      const longContentResponse = await supertestHelper
        .post('/api/posts', { content: 'a'.repeat(501), post_type: 'Recovery Update' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(longContentResponse.status).toBe(400);
      expect(longContentResponse.body.error).toContain('content must be 500 characters or less');

      // Test invalid post type
      const invalidTypeResponse = await supertestHelper
        .post('/api/posts', { content: 'Valid content', post_type: 'Invalid Type' })
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(invalidTypeResponse.status).toBe(400);
      expect(invalidTypeResponse.body.error).toContain('invalid post_type');

      // Test valid post creation
      const validData = createTestPostData();
      const validResponse = await supertestHelper
        .post('/api/posts', validData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(validResponse.status).toBe(201);
      testPostIds.push(validResponse.body.post.id);
    });

    it('should handle all valid post types correctly', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      const validTypes: PostType[] = ['Recovery Update', 'Milestone', 'Inspiration', 'Question', 'Gratitude'];

      for (const postType of validTypes) {
        const postData = createTestPostByType(postType);
        const response = await supertestHelper
          .post('/api/posts', postData)
          .set('Authorization', `Bearer ${user.accessToken}`);

        expect(response.status).toBe(201);
        expect(response.body.post).toHaveProperty('post_type', postType);
        testPostIds.push(response.body.post.id);
      }
    });

    it('should assign post ownership correctly', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      const postData = createTestPostData();
      const response = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(response.status).toBe(201);
      expect(response.body.post).toHaveProperty('user_id', user.id);
      testPostIds.push(response.body.post.id);
    });
  });

  describe('Posts CRUD with Authorization Integration', () => {
    it('should allow post owners to update their posts', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create post
      const postData = createTestPostData();
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      const postId = createResponse.body.post.id;
      testPostIds.push(postId);

      // Update post
      const updateData = {
        content: 'Updated post content',
        post_type: 'Inspiration' as PostType
      };

      const updateResponse = await supertestHelper
        .put(`/api/posts/${postId}`, updateData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body).toHaveProperty('success', true);
      expect(updateResponse.body.post).toHaveProperty('content', updateData.content);
      expect(updateResponse.body.post).toHaveProperty('post_type', updateData.post_type);
    });

    it('should prevent non-owners from updating posts', async () => {
      const [owner, otherUser] = await createMultipleTestUsers(supertestHelper, 2);
      testUserIds.push(owner.id!, otherUser.id!);

      // Owner creates post
      const postData = createTestPostData();
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${owner.accessToken}`);

      const postId = createResponse.body.post.id;
      testPostIds.push(postId);

      // Other user tries to update post
      const updateData = { content: 'Unauthorized update attempt' };
      const updateResponse = await supertestHelper
        .put(`/api/posts/${postId}`, updateData)
        .set('Authorization', `Bearer ${otherUser.accessToken}`);

      expect(updateResponse.status).toBe(403);
      expect(updateResponse.body).toHaveProperty('error', 'you can only update your own posts');
    });

    it('should allow post owners to delete their posts', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create post
      const postData = createTestPostData();
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      const postId = createResponse.body.post.id;

      // Delete post
      const deleteResponse = await supertestHelper
        .delete(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body).toHaveProperty('success', true);

      // Verify post is deleted
      const getResponse = await supertestHelper.get(`/api/posts/${postId}`);
      expect(getResponse.status).toBe(404);
    });

    it('should prevent non-owners from deleting posts', async () => {
      const [owner, otherUser] = await createMultipleTestUsers(supertestHelper, 2);
      testUserIds.push(owner.id!, otherUser.id!);

      // Owner creates post
      const postData = createTestPostData();
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${owner.accessToken}`);

      const postId = createResponse.body.post.id;
      testPostIds.push(postId);

      // Other user tries to delete post
      const deleteResponse = await supertestHelper
        .delete(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${otherUser.accessToken}`);

      expect(deleteResponse.status).toBe(403);
      expect(deleteResponse.body).toHaveProperty('error', 'you can only delete your own posts');

      // Verify post still exists
      const getResponse = await supertestHelper.get(`/api/posts/${postId}`);
      expect(getResponse.status).toBe(200);
    });

    it('should handle post retrieval with user data correctly', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create user profile first
      const profileData = createTestProfileData();
      await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      // Create post
      const postData = createTestPostData();
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      const postId = createResponse.body.post.id;
      testPostIds.push(postId);

      // Get single post
      const getResponse = await supertestHelper.get(`/api/posts/${postId}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.post).toHaveProperty('id', postId);
      expect(getResponse.body.post).toHaveProperty('user');
      expect(getResponse.body.post.user).toHaveProperty('id', user.id);
      expect(getResponse.body.post.user).toHaveProperty('username', profileData.username);
    });
  });

  describe('Posts Feed and Filtering Integration', () => {
    it('should handle posts feed with pagination correctly', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create multiple posts
      const postCount = 5;
      for (let i = 0; i < postCount; i++) {
        const postData = createTestPostData({
          content: `Test post ${i + 1}`
        });
        
        const response = await supertestHelper
          .post('/api/posts', postData)
          .set('Authorization', `Bearer ${user.accessToken}`);
        
        testPostIds.push(response.body.post.id);
        
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Test first page
      const page1Response = await supertestHelper.get('/api/posts?page=1&limit=3');

      expect(page1Response.status).toBe(200);
      expect(page1Response.body.posts).toHaveLength(3);
      expect(page1Response.body.pagination).toEqual(
        expect.objectContaining({
          page: 1,
          limit: 3,
          total: postCount,
          totalPages: 2,
          hasNextPage: true,
          hasPrevPage: false
        })
      );

      // Test second page
      const page2Response = await supertestHelper.get('/api/posts?page=2&limit=3');

      expect(page2Response.status).toBe(200);
      expect(page2Response.body.posts).toHaveLength(2);
      expect(page2Response.body.pagination).toEqual(
        expect.objectContaining({
          page: 2,
          limit: 3,
          total: postCount,
          totalPages: 2,
          hasNextPage: false,
          hasPrevPage: true
        })
      );
    });

    it('should handle posts filtering by type correctly', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create posts of different types
      const postTypes: PostType[] = ['Recovery Update', 'Milestone', 'Inspiration'];
      
      for (const postType of postTypes) {
        const postData = createTestPostByType(postType);
        const response = await supertestHelper
          .post('/api/posts', postData)
          .set('Authorization', `Bearer ${user.accessToken}`);
        
        testPostIds.push(response.body.post.id);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Filter by Milestone posts
      const milestoneResponse = await supertestHelper.get('/api/posts?post_type=Milestone');

      expect(milestoneResponse.status).toBe(200);
      expect(milestoneResponse.body.posts).toHaveLength(1);
      expect(milestoneResponse.body.posts[0]).toHaveProperty('post_type', 'Milestone');

      // Filter by non-existent type
      const nonExistentResponse = await supertestHelper.get('/api/posts?post_type=NonExistent');

      expect(nonExistentResponse.status).toBe(400);
      expect(nonExistentResponse.body.error).toContain('invalid post_type filter');
    });

    it('should return posts in reverse chronological order', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create posts with delays to ensure different timestamps
      const posts = [];
      for (let i = 0; i < 3; i++) {
        const postData = createTestPostData({
          content: `Post created at ${Date.now()}`
        });
        
        const response = await supertestHelper
          .post('/api/posts', postData)
          .set('Authorization', `Bearer ${user.accessToken}`);
        
        posts.push(response.body.post);
        testPostIds.push(response.body.post.id);
        
        // Ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Get posts feed
      const feedResponse = await supertestHelper.get('/api/posts');

      expect(feedResponse.status).toBe(200);
      expect(feedResponse.body.posts).toHaveLength(3);

      // Verify reverse chronological order (newest first)
      const fetchedPosts = feedResponse.body.posts;
      for (let i = 0; i < fetchedPosts.length - 1; i++) {
        const currentPostTime = new Date(fetchedPosts[i].created_at).getTime();
        const nextPostTime = new Date(fetchedPosts[i + 1].created_at).getTime();
        expect(currentPostTime).toBeGreaterThanOrEqual(nextPostTime);
      }
    });

    it('should include user profile data in posts feed', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create user profile
      const profileData = createTestProfileData();
      await supertestHelper
        .post('/api/profiles', profileData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      // Create post
      const postData = createTestPostData();
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      testPostIds.push(createResponse.body.post.id);

      // Get posts feed
      const feedResponse = await supertestHelper.get('/api/posts');

      expect(feedResponse.status).toBe(200);
      expect(feedResponse.body.posts).toHaveLength(1);
      
      const post = feedResponse.body.posts[0];
      expect(post).toHaveProperty('user');
      expect(post.user).toHaveProperty('id', user.id);
      expect(post.user).toHaveProperty('username', profileData.username);
      expect(post.user).toHaveProperty('display_name', profileData.display_name);
      expect(post.user).toHaveProperty('profile_picture_url', profileData.profile_picture_url);
    });
  });

  describe('Posts System Error Handling', () => {
    it('should handle non-existent post operations correctly', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      const fakePostId = '123e4567-e89b-12d3-a456-426614174000';

      // Get non-existent post
      const getResponse = await supertestHelper.get(`/api/posts/${fakePostId}`);
      expect(getResponse.status).toBe(404);
      expect(getResponse.body.error).toBe('post not found');

      // Update non-existent post
      const updateResponse = await supertestHelper
        .put(`/api/posts/${fakePostId}`, { content: 'Updated content' })
        .set('Authorization', `Bearer ${user.accessToken}`);
      expect(updateResponse.status).toBe(404);
      expect(updateResponse.body.error).toBe('post not found');

      // Delete non-existent post
      const deleteResponse = await supertestHelper
        .delete(`/api/posts/${fakePostId}`)
        .set('Authorization', `Bearer ${user.accessToken}`);
      expect(deleteResponse.status).toBe(404);
      expect(deleteResponse.body.error).toBe('post not found');
    });

    it('should handle invalid post ID formats correctly', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      const invalidId = 'invalid-uuid-format';

      // Test all endpoints with invalid ID format
      const getResponse = await supertestHelper.get(`/api/posts/${invalidId}`);
      expect(getResponse.status).toBe(400);
      expect(getResponse.body.error).toBe('invalid post ID format');

      const updateResponse = await supertestHelper
        .put(`/api/posts/${invalidId}`, { content: 'Updated content' })
        .set('Authorization', `Bearer ${user.accessToken}`);
      expect(updateResponse.status).toBe(400);
      expect(updateResponse.body.error).toBe('invalid post ID format');

      const deleteResponse = await supertestHelper
        .delete(`/api/posts/${invalidId}`)
        .set('Authorization', `Bearer ${user.accessToken}`);
      expect(deleteResponse.status).toBe(400);
      expect(deleteResponse.body.error).toBe('invalid post ID format');
    });

    it('should validate pagination parameters correctly', async () => {
      // Invalid page number
      const invalidPageResponse = await supertestHelper.get('/api/posts?page=0');
      expect(invalidPageResponse.status).toBe(400);
      expect(invalidPageResponse.body.error).toContain('page must be a positive integer');

      // Invalid limit
      const invalidLimitResponse = await supertestHelper.get('/api/posts?limit=100');
      expect(invalidLimitResponse.status).toBe(400);
      expect(invalidLimitResponse.body.error).toContain('limit must be between 1 and 50');
    });
  });

  describe('Posts Data Consistency Integration', () => {
    it('should maintain consistency between post creation and retrieval', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      const postData = createTestPostData({
        post_type: 'Milestone',
        image_url: 'https://example.com/test-image.jpg'
      });

      // Create post
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      const postId = createResponse.body.post.id;
      testPostIds.push(postId);

      // Get post and verify all data matches
      const getResponse = await supertestHelper.get(`/api/posts/${postId}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.post).toEqual(
        expect.objectContaining({
          id: postId,
          user_id: user.id,
          content: postData.content,
          post_type: postData.post_type,
          image_url: postData.image_url,
          likes_count: 0,
          comments_count: 0
        })
      );
    });

    it('should handle database transaction integrity during post operations', async () => {
      const user = await createRegisteredTestUser(supertestHelper);
      testUserIds.push(user.id!);

      // Create post with all optional fields
      const postData = createTestPostData({
        content: 'Complex post with all fields',
        post_type: 'Inspiration',
        image_url: 'https://example.com/inspiration.jpg'
      });

      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user.accessToken}`);

      const postId = createResponse.body.post.id;
      testPostIds.push(postId);

      // Verify all fields were saved atomically in database
      const { data: dbPost } = await supabaseClient
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();

      expect(dbPost.content).toBe(postData.content);
      expect(dbPost.post_type).toBe(postData.post_type);
      expect(dbPost.image_url).toBe(postData.image_url);
      expect(dbPost.user_id).toBe(user.id);
      expect(dbPost.likes_count).toBe(0);
      expect(dbPost.comments_count).toBe(0);
      expect(dbPost.created_at).toBeTruthy();
      expect(dbPost.updated_at).toBeTruthy();
    });
  });
});