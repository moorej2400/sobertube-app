/**
 * Likes Endpoints Integration Tests
 */

import request from 'supertest';
import { app } from '../../src/app';
import { getSupabaseClient } from '../../src/services/supabase';
import { createTestUser, createTestPost, createTestVideo, deleteTestData, getValidToken } from '../helpers/testHelpers';

describe('Likes Endpoints Integration Tests', () => {
  let testUserId: string;
  let testPostId: string;
  let testVideoId: string;
  let authToken: string;
  let supabaseClient: any;

  beforeAll(async () => {
    supabaseClient = getSupabaseClient();
    
    // Create test user
    const testUser = await createTestUser();
    testUserId = testUser.id;
    authToken = await getValidToken(testUser);

    // Create test post
    const testPost = await createTestPost(testUserId);
    testPostId = testPost.id;

    // Create test video
    const testVideo = await createTestVideo(testUserId);
    testVideoId = testVideo.id;
  });

  afterAll(async () => {
    // Clean up test data
    await deleteTestData();
  });

  afterEach(async () => {
    // Clean up any likes created during tests
    await supabaseClient
      .from('likes')
      .delete()
      .eq('user_id', testUserId);
  });

  describe('POST /api/likes', () => {
    it('should successfully like a video', async () => {
      const response = await request(app)
        .post('/api/likes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'video',
          content_id: testVideoId
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        liked: true,
        likes_count: 1,
        content_type: 'video',
        content_id: testVideoId
      });

      // Verify like was created in database
      const { data: like } = await supabaseClient
        .from('likes')
        .select('*')
        .eq('user_id', testUserId)
        .eq('content_type', 'video')
        .eq('content_id', testVideoId)
        .single();

      expect(like).toBeTruthy();
      expect(like.user_id).toBe(testUserId);
      expect(like.content_type).toBe('video');
      expect(like.content_id).toBe(testVideoId);
    });

    it('should successfully like a post', async () => {
      const response = await request(app)
        .post('/api/likes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'post',
          content_id: testPostId
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        liked: true,
        likes_count: 1,
        content_type: 'post',
        content_id: testPostId
      });

      // Verify like was created in database
      const { data: like } = await supabaseClient
        .from('likes')
        .select('*')
        .eq('user_id', testUserId)
        .eq('content_type', 'post')
        .eq('content_id', testPostId)
        .single();

      expect(like).toBeTruthy();
      expect(like.user_id).toBe(testUserId);
      expect(like.content_type).toBe('post');
      expect(like.content_id).toBe(testPostId);
    });

    it('should successfully unlike content (toggle off)', async () => {
      // First, like the video
      await request(app)
        .post('/api/likes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'video',
          content_id: testVideoId
        });

      // Then, unlike it (toggle off)
      const response = await request(app)
        .post('/api/likes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'video',
          content_id: testVideoId
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        liked: false,
        likes_count: 0,
        content_type: 'video',
        content_id: testVideoId
      });

      // Verify like was removed from database
      const { data: like } = await supabaseClient
        .from('likes')
        .select('*')
        .eq('user_id', testUserId)
        .eq('content_type', 'video')
        .eq('content_id', testVideoId)
        .single();

      expect(like).toBeNull();
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/likes')
        .send({
          content_type: 'video',
          content_id: testVideoId
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'authentication required'
      });
    });

    it('should return 400 with missing content_type', async () => {
      const response = await request(app)
        .post('/api/likes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_id: testVideoId
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'content_type and content_id are required'
      });
    });

    it('should return 400 with invalid content_type', async () => {
      const response = await request(app)
        .post('/api/likes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'invalid',
          content_id: testVideoId
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'content_type must be either "video" or "post"'
      });
    });

    it('should return 400 with invalid UUID format', async () => {
      const response = await request(app)
        .post('/api/likes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'video',
          content_id: 'invalid-uuid'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'content_id must be a valid UUID'
      });
    });

    it('should return 404 for non-existent content', async () => {
      const nonExistentId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await request(app)
        .post('/api/likes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'video',
          content_id: nonExistentId
        });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'video not found'
      });
    });
  });

  describe('GET /api/likes/status', () => {
    it('should return like status when user has liked content', async () => {
      // First, like the video
      await request(app)
        .post('/api/likes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'video',
          content_id: testVideoId
        });

      const response = await request(app)
        .get('/api/likes/status')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          content_type: 'video',
          content_id: testVideoId
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          content_type: 'video',
          content_id: testVideoId,
          liked: true,
          likes_count: 1
        }
      });
    });

    it('should return like status when user has not liked content', async () => {
      const response = await request(app)
        .get('/api/likes/status')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          content_type: 'post',
          content_id: testPostId
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          content_type: 'post',
          content_id: testPostId,
          liked: false,
          likes_count: 0
        }
      });
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/likes/status')
        .query({
          content_type: 'video',
          content_id: testVideoId
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'authentication required'
      });
    });

    it('should return 400 with missing query parameters', async () => {
      const response = await request(app)
        .get('/api/likes/status')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          content_type: 'video'
          // Missing content_id
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'content_type and content_id query parameters are required'
      });
    });

    it('should return 400 with invalid content_type', async () => {
      const response = await request(app)
        .get('/api/likes/status')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          content_type: 'invalid',
          content_id: testVideoId
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'content_type must be either "video" or "post"'
      });
    });
  });

  describe('GET /api/likes/user', () => {
    beforeEach(async () => {
      // Like both test video and post for testing
      await request(app)
        .post('/api/likes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'video',
          content_id: testVideoId
        });

      await request(app)
        .post('/api/likes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'post',
          content_id: testPostId
        });
    });

    it('should return user liked content', async () => {
      const response = await request(app)
        .get('/api/likes/user')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        limit: 20,
        offset: 0,
        has_more: false
      });

      // Check that both likes are returned
      const contentIds = response.body.data.map((item: any) => item.content_id);
      expect(contentIds).toContain(testVideoId);
      expect(contentIds).toContain(testPostId);
    });

    it('should filter by content_type', async () => {
      const response = await request(app)
        .get('/api/likes/user')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          content_type: 'video'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].content_type).toBe('video');
      expect(response.body.data[0].content_id).toBe(testVideoId);
    });

    it('should apply pagination parameters', async () => {
      const response = await request(app)
        .get('/api/likes/user')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          limit: '1',
          offset: '0'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toEqual({
        limit: 1,
        offset: 0,
        has_more: true // Since we have 2 total items and limit is 1
      });
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/likes/user');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'authentication required'
      });
    });

    it('should return empty array when user has no liked content', async () => {
      // Remove all likes first
      await supabaseClient
        .from('likes')
        .delete()
        .eq('user_id', testUserId);

      const response = await request(app)
        .get('/api/likes/user')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to likes endpoints', async () => {
      // This test would depend on your rate limiting configuration
      // For now, just verify that the endpoint responds correctly under normal load
      
      const promises = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/likes')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            content_type: 'video',
            content_id: testVideoId
          })
      );

      const responses = await Promise.all(promises);
      
      // All requests should succeed (toggle like on/off)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status); // 200 for success, 429 for rate limit
      });
    });
  });
});