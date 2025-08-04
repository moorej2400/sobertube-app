/**
 * Posts CRUD API Tests
 * Test suite for posts endpoints following TDD methodology
 */

import { app } from '../../src/app';
import { createSupertestHelper } from '../helpers/supertest.helper';
import { getSupabaseClient } from '../../src/services/supabase';

describe('Posts API Endpoints', () => {
  const supertestHelper = createSupertestHelper(app);
  const supabaseClient = getSupabaseClient();
  
  // Test data cleanup arrays
  const testUserIds: string[] = [];
  const testPostIds: string[] = [];
  
  // Helper function to create a test user and get auth token
  const createTestUser = async () => {
    const timestamp = Date.now();
    const userData = {
      email: `testuser${timestamp}@example.com`,
      password: 'TestPassword123!',
      username: `user${timestamp}`.substring(0, 20) // Ensure username is ≤20 chars
    };

    const response = await supertestHelper.post('/api/auth/register', userData);
    expect(response.status).toBe(201);
    
    const userId = response.body.user.id;
    testUserIds.push(userId);
    
    // Login to get token
    const loginResponse = await supertestHelper.post('/api/auth/login', {
      email: userData.email,
      password: userData.password
    });
    
    expect(loginResponse.status).toBe(200);
    return {
      userId,
      token: loginResponse.body.accessToken,
      username: userData.username
    };
  };

  // Clean up test data after each test
  afterEach(async () => {
    // Clean up test posts
    if (testPostIds.length > 0) {
      await supabaseClient
        .from('posts')
        .delete()
        .in('id', testPostIds);
      testPostIds.length = 0;
    }
    
    // Clean up test users
    if (testUserIds.length > 0) {
      await supabaseClient
        .from('users')
        .delete()
        .in('id', testUserIds);
      testUserIds.length = 0;
    }
  });

  describe('POST /api/posts - Create Post', () => {
    it('should create a new post with valid data', async () => {
      const { token } = await createTestUser();
      
      const postData = {
        content: 'This is my recovery update for today. Feeling grateful!',
        post_type: 'Recovery Update'
      };
      
      const response = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Post created successfully');
      expect(response.body).toHaveProperty('post');
      expect(response.body.post).toHaveProperty('id');
      expect(response.body.post).toHaveProperty('content', postData.content);
      expect(response.body.post).toHaveProperty('post_type', postData.post_type);
      expect(response.body.post).toHaveProperty('likes_count', 0);
      expect(response.body.post).toHaveProperty('comments_count', 0);
      expect(response.body.post).toHaveProperty('created_at');
      expect(response.body.post).toHaveProperty('updated_at');
      
      testPostIds.push(response.body.post.id);
    });

    it('should create a post with default type when type not specified', async () => {
      const { token } = await createTestUser();
      
      const postData = {
        content: 'Post without specified type'
      };
      
      const response = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(201);
      expect(response.body.post).toHaveProperty('post_type', 'Recovery Update');
      
      testPostIds.push(response.body.post.id);
    });

    it('should create a post with image URL', async () => {
      const { token } = await createTestUser();
      
      const postData = {
        content: 'Check out this motivational quote!',
        post_type: 'Inspiration',
        image_url: 'https://example.com/motivational-quote.jpg'
      };
      
      const response = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(201);
      expect(response.body.post).toHaveProperty('image_url', postData.image_url);
      
      testPostIds.push(response.body.post.id);
    });

    it('should reject post creation without authentication', async () => {
      const postData = {
        content: 'This should fail without auth',
        post_type: 'Recovery Update'
      };
      
      const response = await supertestHelper.post('/api/posts', postData);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject post without content', async () => {
      const { token } = await createTestUser();
      
      const postData = {
        post_type: 'Recovery Update'
      };
      
      const response = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'content is required');
    });

    it('should reject post with empty content', async () => {
      const { token } = await createTestUser();
      
      const postData = {
        content: '   ',
        post_type: 'Recovery Update'
      };
      
      const response = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'content cannot be empty');
    });

    it('should reject post with content too long', async () => {
      const { token } = await createTestUser();
      
      const postData = {
        content: 'a'.repeat(501), // Over 500 character limit
        post_type: 'Recovery Update'
      };
      
      const response = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'content must be 500 characters or less');
    });

    it('should reject post with invalid post type', async () => {
      const { token } = await createTestUser();
      
      const postData = {
        content: 'Valid content',
        post_type: 'Invalid Type'
      };
      
      const response = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('invalid post_type');
    });

    it('should accept all valid post types', async () => {
      const { token } = await createTestUser();
      const validTypes = ['Recovery Update', 'Milestone', 'Inspiration', 'Question', 'Gratitude'];
      
      for (const postType of validTypes) {
        const postData = {
          content: `Test post for ${postType}`,
          post_type: postType
        };
        
        const response = await supertestHelper
          .post('/api/posts', postData)
          .set('Authorization', `Bearer ${token}`);
        
        expect(response.status).toBe(201);
        expect(response.body.post).toHaveProperty('post_type', postType);
        
        testPostIds.push(response.body.post.id);
      }
    });
  });

  describe('GET /api/posts - Get Posts Feed', () => {
    it('should return empty array when no posts exist', async () => {
      const response = await supertestHelper.get('/api/posts');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('posts', []);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 10);
      expect(response.body.pagination).toHaveProperty('total', 0);
    });

    it('should return posts with user information', async () => {
      const { token } = await createTestUser();
      
      // Create a test post
      const postData = {
        content: 'Test post for feed',
        post_type: 'Recovery Update'
      };
      
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${token}`);
      
      testPostIds.push(createResponse.body.post.id);
      
      // Get posts feed
      const response = await supertestHelper.get('/api/posts');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.posts).toHaveLength(1);
      expect(response.body.posts[0]).toHaveProperty('id');
      expect(response.body.posts[0]).toHaveProperty('content', postData.content);
      expect(response.body.posts[0]).toHaveProperty('user');
      expect(response.body.posts[0].user).toHaveProperty('id');
      expect(response.body.posts[0].user).toHaveProperty('username');
    });

    it('should support pagination', async () => {
      const { token } = await createTestUser();
      
      // Create multiple test posts
      for (let i = 0; i < 5; i++) {
        const postData = {
          content: `Test post ${i + 1}`,
          post_type: 'Recovery Update'
        };
        
        const createResponse = await supertestHelper
          .post('/api/posts', postData)
          .set('Authorization', `Bearer ${token}`);
        
        testPostIds.push(createResponse.body.post.id);
      }
      
      // Test pagination parameters
      const response = await supertestHelper.get('/api/posts?page=1&limit=3');
      
      expect(response.status).toBe(200);
      expect(response.body.posts).toHaveLength(3);
      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 3);
      expect(response.body.pagination).toHaveProperty('total', 5);
      expect(response.body.pagination).toHaveProperty('totalPages', 2);
      expect(response.body.pagination).toHaveProperty('hasNextPage', true);
      expect(response.body.pagination).toHaveProperty('hasPrevPage', false);
    });

    it('should filter by post type', async () => {
      const { token } = await createTestUser();
      
      // Create posts of different types
      const postTypes = ['Recovery Update', 'Milestone', 'Inspiration'];
      for (const postType of postTypes) {
        const postData = {
          content: `Test ${postType} post`,
          post_type: postType
        };
        
        const createResponse = await supertestHelper
          .post('/api/posts', postData)
          .set('Authorization', `Bearer ${token}`);
        
        testPostIds.push(createResponse.body.post.id);
      }
      
      // Filter by Milestone posts
      const response = await supertestHelper.get('/api/posts?post_type=Milestone');
      
      expect(response.status).toBe(200);
      expect(response.body.posts).toHaveLength(1);
      expect(response.body.posts[0]).toHaveProperty('post_type', 'Milestone');
    });

    it('should validate pagination parameters', async () => {
      // Invalid page
      const response1 = await supertestHelper.get('/api/posts?page=0');
      expect(response1.status).toBe(400);
      expect(response1.body.error).toContain('page must be a positive integer');
      
      // Invalid limit
      const response2 = await supertestHelper.get('/api/posts?limit=100');
      expect(response2.status).toBe(400);
      expect(response2.body.error).toContain('limit must be between 1 and 50');
      
      // Invalid post_type filter
      const response3 = await supertestHelper.get('/api/posts?post_type=InvalidType');
      expect(response3.status).toBe(400);
      expect(response3.body.error).toContain('invalid post_type filter');
    });

    it('should return posts in reverse chronological order', async () => {
      const { token } = await createTestUser();
      
      // Create multiple posts with slight delays
      const posts = [];
      for (let i = 0; i < 3; i++) {
        const postData = {
          content: `Post ${i + 1}`,
          post_type: 'Recovery Update'
        };
        
        const createResponse = await supertestHelper
          .post('/api/posts', postData)
          .set('Authorization', `Bearer ${token}`);
        
        posts.push(createResponse.body.post);
        testPostIds.push(createResponse.body.post.id);
        
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const response = await supertestHelper.get('/api/posts');
      
      expect(response.status).toBe(200);
      expect(response.body.posts).toHaveLength(3);
      
      // Verify posts are in reverse chronological order (newest first)
      const fetchedPosts = response.body.posts;
      for (let i = 0; i < fetchedPosts.length - 1; i++) {
        const currentPostTime = new Date(fetchedPosts[i].created_at).getTime();
        const nextPostTime = new Date(fetchedPosts[i + 1].created_at).getTime();
        expect(currentPostTime).toBeGreaterThanOrEqual(nextPostTime);
      }
    });
  });

  describe('GET /api/posts/:id - Get Single Post', () => {
    it('should return a specific post by ID', async () => {
      const { token } = await createTestUser();
      
      // Create a test post
      const postData = {
        content: 'Test post for single fetch',
        post_type: 'Inspiration'
      };
      
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${token}`);
      
      const postId = createResponse.body.post.id;
      testPostIds.push(postId);
      
      // Fetch the specific post
      const response = await supertestHelper.get(`/api/posts/${postId}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('post');
      expect(response.body.post).toHaveProperty('id', postId);
      expect(response.body.post).toHaveProperty('content', postData.content);
      expect(response.body.post).toHaveProperty('post_type', postData.post_type);
      expect(response.body.post).toHaveProperty('user');
      expect(response.body.post.user).toHaveProperty('username');
    });

    it('should return 404 for non-existent post', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await supertestHelper.get(`/api/posts/${fakeId}`);
      
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'post not found');
    });

    it('should return 400 for invalid post ID format', async () => {
      const invalidId = 'invalid-uuid';
      
      const response = await supertestHelper.get(`/api/posts/${invalidId}`);
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'invalid post ID format');
    });
  });

  describe('PUT /api/posts/:id - Update Post', () => {
    it('should update a post successfully', async () => {
      const { token } = await createTestUser();
      
      // Create a test post
      const postData = {
        content: 'Original content',
        post_type: 'Recovery Update'
      };
      
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${token}`);
      
      const postId = createResponse.body.post.id;
      testPostIds.push(postId);
      
      // Update the post
      const updateData = {
        content: 'Updated content',
        post_type: 'Inspiration'
      };
      
      const response = await supertestHelper
        .put(`/api/posts/${postId}`, updateData)
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Post updated successfully');
      expect(response.body.post).toHaveProperty('id', postId);
      expect(response.body.post).toHaveProperty('content', updateData.content);
      expect(response.body.post).toHaveProperty('post_type', updateData.post_type);
    });

    it('should update only specified fields', async () => {
      const { token } = await createTestUser();
      
      // Create a test post
      const postData = {
        content: 'Original content',
        post_type: 'Recovery Update'
      };
      
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${token}`);
      
      const postId = createResponse.body.post.id;
      testPostIds.push(postId);
      
      // Update only content
      const updateData = {
        content: 'Updated content only'
      };
      
      const response = await supertestHelper
        .put(`/api/posts/${postId}`, updateData)
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.post).toHaveProperty('content', updateData.content);
      expect(response.body.post).toHaveProperty('post_type', 'Recovery Update'); // Should remain unchanged
    });

    it('should reject update without authentication', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';
      const updateData = { content: 'Updated content' };
      
      const response = await supertestHelper.put(`/api/posts/${fakeId}`, updateData);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should reject update of another user\'s post', async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      
      // User 1 creates a post
      const postData = {
        content: 'User 1 post',
        post_type: 'Recovery Update'
      };
      
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user1.token}`);
      
      const postId = createResponse.body.post.id;
      testPostIds.push(postId);
      
      // User 2 tries to update User 1's post
      const updateData = { content: 'User 2 trying to update' };
      
      const response = await supertestHelper
        .put(`/api/posts/${postId}`, updateData)
        .set('Authorization', `Bearer ${user2.token}`);
      
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'you can only update your own posts');
    });

    it('should validate update data', async () => {
      const { token } = await createTestUser();
      
      // Create a test post first
      const postData = {
        content: 'Original content',
        post_type: 'Recovery Update'
      };
      
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${token}`);
      
      const postId = createResponse.body.post.id;
      testPostIds.push(postId);
      
      // Test empty update
      const response1 = await supertestHelper
        .put(`/api/posts/${postId}`, {})
        .set('Authorization', `Bearer ${token}`);
      
      expect(response1.status).toBe(400);
      expect(response1.body.error).toContain('at least one field must be provided');
      
      // Test content too long
      const response2 = await supertestHelper
        .put(`/api/posts/${postId}`, { content: 'a'.repeat(501) })
        .set('Authorization', `Bearer ${token}`);
      
      expect(response2.status).toBe(400);
      expect(response2.body.error).toContain('content must be 500 characters or less');
      
      // Test empty content
      const response3 = await supertestHelper
        .put(`/api/posts/${postId}`, { content: '   ' })
        .set('Authorization', `Bearer ${token}`);
      
      expect(response3.status).toBe(400);
      expect(response3.body.error).toContain('content cannot be empty');
      
      // Test invalid post type
      const response4 = await supertestHelper
        .put(`/api/posts/${postId}`, { post_type: 'Invalid Type' })
        .set('Authorization', `Bearer ${token}`);
      
      expect(response4.status).toBe(400);
      expect(response4.body.error).toContain('invalid post_type');
    });
  });

  describe('DELETE /api/posts/:id - Delete Post', () => {
    it('should delete a post successfully', async () => {
      const { token } = await createTestUser();
      
      // Create a test post
      const postData = {
        content: 'Post to be deleted',
        post_type: 'Recovery Update'
      };
      
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${token}`);
      
      const postId = createResponse.body.post.id;
      
      // Delete the post
      const response = await supertestHelper
        .delete(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Post deleted successfully');
      
      // Verify post is actually deleted
      const getResponse = await supertestHelper.get(`/api/posts/${postId}`);
      expect(getResponse.status).toBe(404);
    });

    it('should reject delete without authentication', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await supertestHelper.delete(`/api/posts/${fakeId}`);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should reject delete of another user\'s post', async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      
      // User 1 creates a post
      const postData = {
        content: 'User 1 post to be protected',
        post_type: 'Recovery Update'
      };
      
      const createResponse = await supertestHelper
        .post('/api/posts', postData)
        .set('Authorization', `Bearer ${user1.token}`);
      
      const postId = createResponse.body.post.id;
      testPostIds.push(postId); // Keep for cleanup
      
      // User 2 tries to delete User 1's post
      const response = await supertestHelper
        .delete(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${user2.token}`);
      
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'you can only delete your own posts');
    });

    it('should return 404 for non-existent post', async () => {
      const { token } = await createTestUser();
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await supertestHelper
        .delete(`/api/posts/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'post not found');
    });

    it('should return 400 for invalid post ID format', async () => {
      const { token } = await createTestUser();
      const invalidId = 'invalid-uuid';
      
      const response = await supertestHelper
        .delete(`/api/posts/${invalidId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'invalid post ID format');
    });
  });
});