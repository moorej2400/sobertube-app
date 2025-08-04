/**
 * Comprehensive test suite for video CRUD operations
 * Tests video listing, retrieval, updating, and deletion endpoints
 */

import request from 'supertest';
import { app } from '../src/app';
import { getSupabaseClient } from '../src/services/supabase';

describe('Video CRUD Operations', () => {
  let authToken: string;
  let userId: string;
  let testVideoId: string;
  let otherUserAuthToken: string;
  let otherUserId: string;
  const supabaseClient = getSupabaseClient();

  // Test video data
  const testVideoData = {
    title: 'Test Video for CRUD',
    description: 'This is a test video for CRUD operations',
    video_url: 'https://example.com/test-video.mp4',
    thumbnail_url: 'https://example.com/test-thumbnail.jpg',
    duration: 120, // 2 minutes
    file_size: 10485760, // 10MB
    format: 'mp4',
    status: 'ready'
  };



  beforeAll(async () => {
    // Clean up any existing test users
    await supabaseClient
      .from('users')
      .delete()
      .eq('email', 'video-crud-test@example.com');
    await supabaseClient
      .from('users')
      .delete()
      .eq('email', 'other-crud-test@example.com');

    // Create first test user
    const { data: user1, error: user1Error } = await supabaseClient
      .from('users')
      .insert({
        email: 'video-crud-test@example.com',
        username: 'videocrudtest',
        display_name: 'Video CRUD Test User',
        privacy_level: 'public'
      })
      .select()
      .single();

    if (user1Error) {
      throw new Error(`Failed to create first test user: ${user1Error.message}`);
    }
    userId = user1.id;

    // Create second test user (for permission testing)
    const { data: user2, error: user2Error } = await supabaseClient
      .from('users')
      .insert({
        email: 'other-crud-test@example.com',
        username: 'othercrudtest',
        display_name: 'Other CRUD Test User',
        privacy_level: 'public'
      })
      .select()
      .single();

    if (user2Error) {
      throw new Error(`Failed to create second test user: ${user2Error.message}`);
    }
    otherUserId = user2.id;

    // Create auth tokens
    const jwt = require('jsonwebtoken');
    const secret = process.env['JWT_SECRET'] || 'test-secret';
    
    authToken = jwt.sign(
      { id: userId, email: user1.email },
      secret,
      { expiresIn: '1h' }
    );

    otherUserAuthToken = jwt.sign(
      { id: otherUserId, email: user2.email },
      secret,
      { expiresIn: '1h' }
    );

    // Create test videos directly in database
    const { data: video1 } = await supabaseClient
      .from('videos')
      .insert({ ...testVideoData, user_id: userId })
      .select()
      .single();
    testVideoId = video1.id;
  });

  afterAll(async () => {
    // Clean up test videos
    await supabaseClient.from('videos').delete().eq('user_id', userId);
    await supabaseClient.from('videos').delete().eq('user_id', otherUserId);

    // Clean up test users
    await supabaseClient.from('users').delete().eq('id', userId);
    await supabaseClient.from('users').delete().eq('id', otherUserId);
  });

  describe('GET /api/videos - List all public videos', () => {
    it('should return paginated list of ready videos (public)', async () => {
      const response = await request(app)
        .get('/api/videos')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        pagination: {
          page: 1,
          limit: 10,
          total: expect.any(Number),
          total_pages: expect.any(Number)
        }
      });

      // Should only include ready videos
      response.body.data.forEach((video: any) => {
        expect(video.status).toBe('ready');
        expect(video).toHaveProperty('id');
        expect(video).toHaveProperty('title');
        expect(video).toHaveProperty('description');
        expect(video).toHaveProperty('duration');
        expect(video).toHaveProperty('views_count');
        expect(video).toHaveProperty('likes_count');
        expect(video).toHaveProperty('created_at');
        // Should not expose user_id for privacy
        expect(video).not.toHaveProperty('user_id');
      });
    });

    it('should support pagination parameters', async () => {
      const response = await request(app)
        .get('/api/videos?page=1&limit=5')
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });

    it('should support sorting by creation date (newest first by default)', async () => {
      const response = await request(app)
        .get('/api/videos')
        .expect(200);

      if (response.body.data.length > 1) {
        const firstVideo = new Date(response.body.data[0].created_at);
        const secondVideo = new Date(response.body.data[1].created_at);
        expect(firstVideo.getTime()).toBeGreaterThanOrEqual(secondVideo.getTime());
      }
    });

    it('should support sorting by views count', async () => {
      const response = await request(app)
        .get('/api/videos?sort=views&order=desc')
        .expect(200);

      if (response.body.data.length > 1) {
        expect(response.body.data[0].views_count).toBeGreaterThanOrEqual(response.body.data[1].views_count);
      }
    });

    it('should support filtering by duration range', async () => {
      const response = await request(app)
        .get('/api/videos?min_duration=60&max_duration=180')
        .expect(200);

      response.body.data.forEach((video: any) => {
        expect(video.duration).toBeGreaterThanOrEqual(60);
        expect(video.duration).toBeLessThanOrEqual(180);
      });
    });
  });

  describe('GET /api/videos/:id - Get single video', () => {
    it('should return video details for valid ID', async () => {
      const response = await request(app)
        .get(`/api/videos/${testVideoId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: testVideoId,
          title: testVideoData.title,
          description: testVideoData.description,
          duration: testVideoData.duration,
          format: testVideoData.format,
          status: 'ready',
          views_count: expect.any(Number),
          likes_count: expect.any(Number),
          comments_count: expect.any(Number),
          created_at: expect.any(String),
          updated_at: expect.any(String)
        }
      });
    });

    it('should increment view count when video is accessed', async () => {
      // Get current view count
      const initialResponse = await request(app)
        .get(`/api/videos/${testVideoId}`)
        .expect(200);
      
      const initialViews = initialResponse.body.data.views_count;

      // Access video again
      const secondResponse = await request(app)
        .get(`/api/videos/${testVideoId}`)
        .expect(200);

      expect(secondResponse.body.data.views_count).toBe(initialViews + 1);
    });

    it('should return 404 for non-existent video', async () => {
      const fakeId = '12345678-1234-1234-1234-123456789abc';
      const response = await request(app)
        .get(`/api/videos/${fakeId}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Video not found'
      });
    });

    it('should return 400 for invalid video ID format', async () => {
      const response = await request(app)
        .get('/api/videos/invalid-id')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid video ID format'
      });
    });

    it('should not return videos with status other than ready for public access', async () => {
      // Create a processing video
      const { data: processingVideo } = await supabaseClient
        .from('videos')
        .insert({
          ...testVideoData,
          user_id: userId,
          status: 'processing',
          title: 'Processing Video'
        })
        .select()
        .single();

      const response = await request(app)
        .get(`/api/videos/${processingVideo.id}`)
        .expect(404);

      expect(response.body.error).toBe('Video not found');

      // Cleanup
      await supabaseClient.from('videos').delete().eq('id', processingVideo.id);
    });
  });

  describe('GET /api/videos/user/:userId - Get user\'s public videos', () => {
    it('should return user\'s ready videos', async () => {
      const response = await request(app)
        .get(`/api/videos/user/${userId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        pagination: expect.any(Object)
      });

      // All videos should belong to the user and be ready
      response.body.data.forEach((video: any) => {
        expect(video.status).toBe('ready');
      });
    });

    it('should return 404 for non-existent user', async () => {
      const fakeUserId = '12345678-1234-1234-1234-123456789abc';
      const response = await request(app)
        .get(`/api/videos/user/${fakeUserId}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'User not found'
      });
    });

    it('should support pagination for user videos', async () => {
      const response = await request(app)
        .get(`/api/videos/user/${userId}?page=1&limit=1`)
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(1);
      expect(response.body.data.length).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /api/videos/my-videos - Get current user\'s videos (protected)', () => {
    it('should return authenticated user\'s videos with all statuses', async () => {
      const response = await request(app)
        .get('/api/videos/my-videos')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        pagination: expect.any(Object)
      });

      // Should include videos with any status
      const userVideos = response.body.data;
      expect(userVideos.length).toBeGreaterThan(0);
      
      userVideos.forEach((video: any) => {
        expect(video).toHaveProperty('status');
        expect(['ready', 'processing', 'failed']).toContain(video.status);
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/videos/my-videos')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should support filtering by status', async () => {
      const response = await request(app)
        .get('/api/videos/my-videos?status=ready')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      response.body.data.forEach((video: any) => {
        expect(video.status).toBe('ready');
      });
    });
  });

  describe('PUT /api/videos/:id - Update video metadata (protected)', () => {
    const updateData = {
      title: 'Updated Test Video Title',
      description: 'Updated description for the test video'
    };

    it('should update video metadata successfully', async () => {
      const response = await request(app)
        .put(`/api/videos/${testVideoId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: testVideoId,
          title: updateData.title,
          description: updateData.description,
          updated_at: expect.any(String)
        }
      });

      // Verify the update in database
      const { data: updatedVideo } = await supabaseClient
        .from('videos')
        .select('title, description')
        .eq('id', testVideoId)
        .single();

      expect(updatedVideo?.title).toBe(updateData.title);
      expect(updatedVideo?.description).toBe(updateData.description);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put(`/api/videos/${testVideoId}`)
        .send(updateData)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should prevent updating video owned by different user', async () => {
      const response = await request(app)
        .put(`/api/videos/${testVideoId}`)
        .set('Authorization', `Bearer ${otherUserAuthToken}`)
        .send(updateData)
        .expect(403);

      expect(response.body.error).toBe('Access denied');
    });

    it('should validate title length', async () => {
      const invalidData = {
        title: 'a'.repeat(201), // Exceeds 200 character limit
        description: 'Valid description'
      };

      const response = await request(app)
        .put(`/api/videos/${testVideoId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toContain('title');
    });

    it('should validate description length', async () => {
      const invalidData = {
        title: 'Valid title',
        description: 'a'.repeat(2001) // Exceeds 2000 character limit
      };

      const response = await request(app)
        .put(`/api/videos/${testVideoId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toContain('description');
    });
  });

  describe('DELETE /api/videos/:id - Delete video (protected)', () => {
    let videoToDelete: string;

    beforeEach(async () => {
      // Create a video specifically for deletion testing
      const { data: video } = await supabaseClient
        .from('videos')
        .insert({
          ...testVideoData,
          user_id: userId,
          title: 'Video to Delete'
        })
        .select()
        .single();
      videoToDelete = video.id;
    });

    it('should delete video successfully', async () => {
      const response = await request(app)
        .delete(`/api/videos/${videoToDelete}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Video deleted successfully'
      });

      // Verify video is deleted
      const { data: deletedVideo, error } = await supabaseClient
        .from('videos')
        .select()
        .eq('id', videoToDelete)
        .single();

      expect(error).toBeTruthy(); // Should not find the video
      expect(deletedVideo).toBeNull();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete(`/api/videos/${videoToDelete}`)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should prevent deleting video owned by different user', async () => {
      const response = await request(app)
        .delete(`/api/videos/${videoToDelete}`)
        .set('Authorization', `Bearer ${otherUserAuthToken}`)
        .expect(403);

      expect(response.body.error).toBe('Access denied');
    });

    it('should return 404 for non-existent video', async () => {
      const fakeId = '12345678-1234-1234-1234-123456789abc';
      const response = await request(app)
        .delete(`/api/videos/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Video not found');
    });
  });

  describe('POST /api/videos/:id/like - Like/Unlike video (protected)', () => {
    it('should like a video successfully', async () => {
      const response = await request(app)
        .post(`/api/videos/${testVideoId}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        liked: true,
        likes_count: expect.any(Number)
      });
    });

    it('should unlike a previously liked video', async () => {
      // First like the video
      await request(app)
        .post(`/api/videos/${testVideoId}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Then unlike it
      const response = await request(app)
        .post(`/api/videos/${testVideoId}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        liked: false,
        likes_count: expect.any(Number)
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post(`/api/videos/${testVideoId}/like`)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });
});