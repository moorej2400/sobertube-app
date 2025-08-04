/**
 * Feed API Integration Tests
 * Test suite for unified feed endpoints following TDD methodology
 */

import { app } from '../../src/app';
import { createSupertestHelper } from '../helpers/supertest.helper';
import { getSupabaseClient } from '../../src/services/supabase';

describe('Feed API Endpoints', () => {
  const supertestHelper = createSupertestHelper(app);
  const supabaseClient = getSupabaseClient();
  
  // Test data cleanup arrays
  const testUserIds: string[] = [];
  const testPostIds: string[] = [];
  const testVideoIds: string[] = [];
  
  // Helper function to create a test user and get auth token
  const createTestUser = async (suffix = '') => {
    const timestamp = Date.now() + Math.random();
    const userData = {
      email: `feeduser${timestamp}${suffix}@example.com`,
      password: 'TestPassword123!',
      username: `feeduser${timestamp}${suffix}`.substring(0, 20) // Ensure username is ≤20 chars
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

  // Helper function to create test post
  const createTestPost = async (userId: string, content: string, postType = 'Recovery Update') => {
    const { data: post, error } = await supabaseClient
      .from('posts')
      .insert({
        user_id: userId,
        content,
        post_type: postType
      })
      .select()
      .single();

    if (error) throw error;
    testPostIds.push(post.id);
    return post;
  };

  // Helper function to create test video
  const createTestVideo = async (userId: string, title: string, description = 'Test video') => {
    const { data: video, error } = await supabaseClient
      .from('videos')
      .insert({
        user_id: userId,
        title,
        description,
        video_url: '/test/video.mp4',
        duration: 120,
        file_size: 1024000,
        format: 'mp4',
        status: 'ready'
      })
      .select()
      .single();

    if (error) throw error;
    testVideoIds.push(video.id);
    return video;
  };

  // Clean up test data after each test
  afterEach(async () => {
    // Clean up test videos
    if (testVideoIds.length > 0) {
      await supabaseClient
        .from('videos')
        .delete()
        .in('id', testVideoIds);
      testVideoIds.length = 0;
    }

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

  describe('GET /api/feed - Unified Feed', () => {
    it('should return mixed content (posts and videos) by default', async () => {
      const { userId: user1 } = await createTestUser('1');
      const { userId: user2 } = await createTestUser('2');
      
      // Create test content
      await createTestPost(user1, 'This is a recovery post', 'Recovery Update');
      await createTestVideo(user2, 'Recovery Journey Video', 'My story of recovery');
      
      const response = await supertestHelper.get('/api/feed');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      // Check that we have mixed content types
      const hasPost = response.body.data.some((item: any) => item.type === 'post');
      const hasVideo = response.body.data.some((item: any) => item.type === 'video');
      
      expect(hasPost || hasVideo).toBe(true);
      
      // Verify feed item structure
      response.body.data.forEach((item: any) => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('type');
        expect(['post', 'video']).toContain(item.type);
        expect(item).toHaveProperty('user_id');
        expect(item).toHaveProperty('user');
        expect(item.user).toHaveProperty('username');
        expect(item).toHaveProperty('likes_count');
        expect(item).toHaveProperty('comments_count');
        expect(item).toHaveProperty('created_at');
      });
    });

    it('should return posts only when content_type=posts', async () => {
      const { userId } = await createTestUser();
      
      await createTestPost(userId, 'Test post content');
      await createTestVideo(userId, 'Test video title');
      
      const response = await supertestHelper.get('/api/feed?content_type=posts');
      
      expect(response.status).toBe(200);
      expect(response.body.data.every((item: any) => item.type === 'post')).toBe(true);
    });

    it('should return videos only when content_type=videos', async () => {
      const { userId } = await createTestUser();
      
      await createTestPost(userId, 'Test post content');
      await createTestVideo(userId, 'Test video title');
      
      const response = await supertestHelper.get('/api/feed?content_type=videos');
      
      expect(response.status).toBe(200);
      expect(response.body.data.every((item: any) => item.type === 'video')).toBe(true);
    });

    it('should support pagination with cursor', async () => {
      const { userId } = await createTestUser();
      
      // Create multiple test items
      for (let i = 0; i < 5; i++) {
        await createTestPost(userId, `Test post ${i}`);
      }
      
      const firstResponse = await supertestHelper.get('/api/feed?limit=2');
      
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body.data.length).toBe(2);
      expect(firstResponse.body.pagination).toHaveProperty('has_more', true);
      expect(firstResponse.body.pagination).toHaveProperty('next_cursor');
      
      // Use cursor for next page
      const cursor = firstResponse.body.pagination.next_cursor;
      const secondResponse = await supertestHelper.get(`/api/feed?limit=2&cursor=${cursor}`);
      
      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body.data.length).toBeGreaterThan(0);
      
      // Ensure different content
      const firstIds = firstResponse.body.data.map((item: any) => item.id);
      const secondIds = secondResponse.body.data.map((item: any) => item.id);
      const overlap = firstIds.filter((id: string) => secondIds.includes(id));
      expect(overlap.length).toBe(0);
    });

    it('should filter by post_type when specified', async () => {
      const { userId } = await createTestUser();
      
      await createTestPost(userId, 'Milestone post', 'Milestone');
      await createTestPost(userId, 'Recovery update', 'Recovery Update');
      
      const response = await supertestHelper.get('/api/feed?post_type=Milestone');
      
      expect(response.status).toBe(200);
      const posts = response.body.data.filter((item: any) => item.type === 'post');
      expect(posts.every((post: any) => post.post_type === 'Milestone')).toBe(true);
    });

    it('should filter by user_id when specified', async () => {
      const { userId: user1 } = await createTestUser('1');
      const { userId: user2 } = await createTestUser('2');
      
      await createTestPost(user1, 'User 1 post');
      await createTestPost(user2, 'User 2 post');
      await createTestVideo(user1, 'User 1 video');
      
      const response = await supertestHelper.get(`/api/feed?user_id=${user1}`);
      
      expect(response.status).toBe(200);
      expect(response.body.data.every((item: any) => item.user_id === user1)).toBe(true);
    });

    it('should sort chronologically by default', async () => {
      const { userId } = await createTestUser();
      
      // Create posts with slight delays to ensure different timestamps
      await createTestPost(userId, 'First post');
      await new Promise(resolve => setTimeout(resolve, 10));
      await createTestPost(userId, 'Second post');
      
      const response = await supertestHelper.get('/api/feed?sort=chronological');
      
      expect(response.status).toBe(200);
      
      // Verify chronological order (newest first)
      for (let i = 1; i < response.body.data.length; i++) {
        const current = new Date(response.body.data[i].created_at);
        const previous = new Date(response.body.data[i - 1].created_at);
        expect(current.getTime()).toBeLessThanOrEqual(previous.getTime());
      }
    });

    it('should handle empty feed gracefully', async () => {
      const response = await supertestHelper.get('/api/feed');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should validate limit parameter', async () => {
      const response = await supertestHelper.get('/api/feed?limit=invalid');
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate content_type parameter', async () => {
      const response = await supertestHelper.get('/api/feed?content_type=invalid');
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('content_type must be one of');
    });

    it('should validate post_type parameter', async () => {
      const response = await supertestHelper.get('/api/feed?post_type=InvalidType');
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('invalid post_type filter');
    });

    it('should validate user_id parameter format', async () => {
      const response = await supertestHelper.get('/api/feed?user_id=invalid-uuid');
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('invalid user_id format');
    });

    it('should validate cursor parameter', async () => {
      const response = await supertestHelper.get('/api/feed?cursor=invalid-cursor');
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('invalid cursor format');
    });
  });

  describe('GET /api/feed/personalized - Personalized Feed', () => {
    it('should require authentication', async () => {
      const response = await supertestHelper.get('/api/feed/personalized');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('authentication required');
    });

    it('should return feed for authenticated user', async () => {
      const { token, userId } = await createTestUser();
      
      await createTestPost(userId, 'Personal feed test');
      
      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/feed/stats - Feed Statistics', () => {
    it('should return feed statistics', async () => {
      const { userId } = await createTestUser();
      
      await createTestPost(userId, 'Stats test post');
      await createTestVideo(userId, 'Stats test video');
      
      const response = await supertestHelper.get('/api/feed/stats');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('statistics');
      expect(response.body.statistics).toHaveProperty('total_content');
      expect(response.body.statistics).toHaveProperty('total_posts');
      expect(response.body.statistics).toHaveProperty('total_videos');
      expect(response.body.statistics).toHaveProperty('total_users');
      expect(response.body.statistics).toHaveProperty('recent_activity');
      expect(response.body).toHaveProperty('timestamp');
      
      expect(typeof response.body.statistics.total_content).toBe('number');
      expect(typeof response.body.statistics.total_posts).toBe('number');
      expect(typeof response.body.statistics.total_videos).toBe('number');
      expect(typeof response.body.statistics.total_users).toBe('number');
    });
  });

  describe('Feed Integration with Existing Systems', () => {
    it('should include user information in feed items', async () => {
      const { userId, username } = await createTestUser();
      
      await createTestPost(userId, 'User info test');
      
      const response = await supertestHelper.get('/api/feed');
      
      expect(response.status).toBe(200);
      const userPost = response.body.data.find((item: any) => item.user_id === userId);
      expect(userPost).toBeDefined();
      expect(userPost.user).toHaveProperty('username', username);
      expect(userPost.user).toHaveProperty('id', userId);
    });

    it('should handle mixed content sorting correctly', async () => {
      const { userId } = await createTestUser();
      
      // Create content with known order
      const post1 = await createTestPost(userId, 'First post');
      await new Promise(resolve => setTimeout(resolve, 10));
      const video1 = await createTestVideo(userId, 'Second video');
      await new Promise(resolve => setTimeout(resolve, 10));
      const post2 = await createTestPost(userId, 'Third post');
      
      const response = await supertestHelper.get('/api/feed?sort=chronological');
      
      expect(response.status).toBe(200);
      
      // Find our test content in response
      const ourContent = response.body.data.filter((item: any) => 
        [post1.id, video1.id, post2.id].includes(item.id)
      );
      
      expect(ourContent.length).toBe(3);
      
      // Verify chronological order (newest first)
      expect(ourContent[0].id).toBe(post2.id);
      expect(ourContent[1].id).toBe(video1.id);
      expect(ourContent[2].id).toBe(post1.id);
    });

    it('should respect video status filtering (only ready videos)', async () => {
      const { userId } = await createTestUser();
      
      // Create a processing video (should not appear in feed)
      const { data: processingVideo } = await supabaseClient
        .from('videos')
        .insert({
          user_id: userId,
          title: 'Processing video',
          video_url: '/test/processing.mp4',
          duration: 60,
          file_size: 500000,
          format: 'mp4',
          status: 'processing'
        })
        .select()
        .single();
      
      testVideoIds.push(processingVideo.id);
      
      // Create a ready video (should appear in feed)
      await createTestVideo(userId, 'Ready video');
      
      const response = await supertestHelper.get('/api/feed?content_type=videos');
      
      expect(response.status).toBe(200);
      const videoIds = response.body.data.map((item: any) => item.id);
      expect(videoIds).not.toContain(processingVideo.id);
    });
  });
});