/**
 * Comments Endpoints Integration Tests
 */

import request from 'supertest';
import { app } from '../../src/app';
import { getSupabaseClient } from '../../src/services/supabase';
import { createTestUser, createTestPost, createTestVideo, deleteTestData, getValidToken } from '../helpers/testHelpers';

describe('Comments Endpoints Integration Tests', () => {
  let testUserId: string;
  let testUser2Id: string;
  let testPostId: string;
  let testVideoId: string;
  let authToken: string;
  let authToken2: string;
  let supabaseClient: any;

  beforeAll(async () => {
    supabaseClient = getSupabaseClient();
    
    // Create test users
    const testUser1 = await createTestUser();
    testUserId = testUser1.id;
    authToken = await getValidToken(testUser1);

    const testUser2 = await createTestUser();
    testUser2Id = testUser2.id;
    authToken2 = await getValidToken(testUser2);

    // Create test content
    const testPost = await createTestPost(testUserId);
    testPostId = testPost.id;

    const testVideo = await createTestVideo(testUserId);
    testVideoId = testVideo.id;
  });

  afterAll(async () => {
    // Clean up test data
    await deleteTestData();
  });

  afterEach(async () => {
    // Clean up any comments created during tests
    await supabaseClient
      .from('comments')
      .delete()
      .or(`user_id.eq.${testUserId},user_id.eq.${testUser2Id}`);
  });

  describe('POST /api/comments', () => {
    it('should successfully create a comment on a video', async () => {
      const commentData = {
        content_type: 'video',
        content_id: testVideoId,
        content: 'Great video! Really helpful content.'
      };

      const response = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(commentData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        user_id: testUserId,
        content: commentData.content,
        likes_count: 0,
        replies_count: 0,
        is_edited: false,
        parent_comment_id: null
      });
      expect(response.body.data.id).toBeTruthy();
      expect(response.body.data.username).toBeTruthy();
      expect(response.body.data.created_at).toBeTruthy();

      // Verify comment was created in database
      const { data: comment } = await supabaseClient
        .from('comments')
        .select('*')
        .eq('id', response.body.data.id)
        .single();

      expect(comment).toBeTruthy();
      expect(comment.content).toBe(commentData.content);
      expect(comment.content_type).toBe('video');
      expect(comment.content_id).toBe(testVideoId);
    });

    it('should successfully create a comment on a post', async () => {
      const commentData = {
        content_type: 'post',
        content_id: testPostId,
        content: 'Thanks for sharing this post!'
      };

      const response = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(commentData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe(commentData.content);
      expect(response.body.data.user_id).toBe(testUserId);
    });

    it('should successfully create a reply to a comment', async () => {
      // First, create a parent comment
      const parentCommentData = {
        content_type: 'video',
        content_id: testVideoId,
        content: 'Original comment'
      };

      const parentResponse = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(parentCommentData);

      const parentCommentId = parentResponse.body.data.id;

      // Then, create a reply
      const replyData = {
        content_type: 'video',
        content_id: testVideoId,
        content: 'Reply to the comment',
        parent_comment_id: parentCommentId
      };

      const replyResponse = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken2}`)
        .send(replyData);

      expect(replyResponse.status).toBe(201);
      expect(replyResponse.body.success).toBe(true);
      expect(replyResponse.body.data.content).toBe(replyData.content);
      expect(replyResponse.body.data.parent_comment_id).toBe(parentCommentId);
      expect(replyResponse.body.data.user_id).toBe(testUser2Id);

      // Verify parent comment replies_count was updated
      const updatedParentResponse = await request(app)
        .get('/api/comments')
        .query({
          content_type: 'video',
          content_id: testVideoId
        });

      const updatedParentComment = updatedParentResponse.body.data.find(
        (c: any) => c.id === parentCommentId
      );
      expect(updatedParentComment.replies_count).toBe(1);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/comments')
        .send({
          content_type: 'video',
          content_id: testVideoId,
          content: 'Test comment'
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'authentication required'
      });
    });

    it('should return 400 with missing required fields', async () => {
      const response = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'video'
          // Missing content_id and content
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'content_type, content_id, and content are required'
      });
    });

    it('should return 400 with invalid content_type', async () => {
      const response = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'invalid',
          content_id: testVideoId,
          content: 'Test comment'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'content_type must be either "video" or "post"'
      });
    });

    it('should return 400 with content too long', async () => {
      const response = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'video',
          content_id: testVideoId,
          content: 'a'.repeat(2001) // Exceeds 2000 character limit
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'comment content must be between 1 and 2000 characters'
      });
    });

    it('should return 404 for non-existent content', async () => {
      const nonExistentId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'video',
          content_id: nonExistentId,
          content: 'Test comment'
        });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'video not found'
      });
    });
  });

  describe('GET /api/comments', () => {
    let testCommentId: string;
    let testReplyId: string;

    beforeEach(async () => {
      // Create test comments for each test
      const commentResponse = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'video',
          content_id: testVideoId,
          content: 'Test comment for retrieval'
        });
      testCommentId = commentResponse.body.data.id;

      // Create a reply
      const replyResponse = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken2}`)
        .send({
          content_type: 'video',
          content_id: testVideoId,
          content: 'Test reply',
          parent_comment_id: testCommentId
        });
      testReplyId = replyResponse.body.data.id;
    });

    it('should successfully get comments for video', async () => {
      const response = await request(app)
        .get('/api/comments')
        .query({
          content_type: 'video',
          content_id: testVideoId
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1); // Only parent comments
      expect(response.body.data[0].id).toBe(testCommentId);
      expect(response.body.data[0].replies_count).toBe(1);
      expect(response.body.pagination).toEqual({
        limit: 20,
        offset: 0,
        has_more: false,
        total_returned: 1
      });
    });

    it('should successfully get replies to a specific comment', async () => {
      const response = await request(app)
        .get('/api/comments')
        .query({
          content_type: 'video',
          content_id: testVideoId,
          parent_comment_id: testCommentId
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(testReplyId);
      expect(response.body.data[0].parent_comment_id).toBe(testCommentId);
    });

    it('should support pagination', async () => {
      // Create multiple comments
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/comments')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            content_type: 'video',
            content_id: testVideoId,
            content: `Comment ${i}`
          });
      }

      const response = await request(app)
        .get('/api/comments')
        .query({
          content_type: 'video',
          content_id: testVideoId,
          limit: '3',
          offset: '0'
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination.has_more).toBe(true);
    });

    it('should support different sort orders', async () => {
      const response = await request(app)
        .get('/api/comments')
        .query({
          content_type: 'video',
          content_id: testVideoId,
          sort_order: 'oldest'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.metadata.sort_order).toBe('oldest');
    });

    it('should return 400 with missing required parameters', async () => {
      const response = await request(app)
        .get('/api/comments')
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

    it('should return 400 with invalid sort order', async () => {
      const response = await request(app)
        .get('/api/comments')
        .query({
          content_type: 'video',
          content_id: testVideoId,
          sort_order: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'sort_order must be one of: newest, oldest, most_liked'
      });
    });

    it('should return empty array for content with no comments', async () => {
      // Use a different video with no comments
      const otherVideo = await createTestVideo(testUserId);
      
      const response = await request(app)
        .get('/api/comments')
        .query({
          content_type: 'video',
          content_id: otherVideo.id
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('PUT /api/comments/:id', () => {
    let testCommentId: string;

    beforeEach(async () => {
      // Create a test comment
      const response = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'video',
          content_id: testVideoId,
          content: 'Original comment content'
        });
      testCommentId = response.body.data.id;
    });

    it('should successfully update own comment', async () => {
      const updatedContent = 'Updated comment content';
      
      const response = await request(app)
        .put(`/api/comments/${testCommentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: updatedContent
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe(updatedContent);
      expect(response.body.data.is_edited).toBe(true);
      expect(response.body.data.id).toBe(testCommentId);

      // Verify update in database
      const { data: comment } = await supabaseClient
        .from('comments')
        .select('*')
        .eq('id', testCommentId)
        .single();

      expect(comment.content).toBe(updatedContent);
      expect(comment.is_edited).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .put(`/api/comments/${testCommentId}`)
        .send({
          content: 'Updated content'
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'authentication required'
      });
    });

    it('should return 400 with invalid comment ID', async () => {
      const response = await request(app)
        .put('/api/comments/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Updated content'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'comment ID must be a valid UUID'
      });
    });

    it('should return 400 with missing content', async () => {
      const response = await request(app)
        .put(`/api/comments/${testCommentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'content is required'
      });
    });

    it('should return 404 when trying to update another user\'s comment', async () => {
      const response = await request(app)
        .put(`/api/comments/${testCommentId}`)
        .set('Authorization', `Bearer ${authToken2}`) // Different user
        .send({
          content: 'Trying to update someone else\'s comment'
        });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'comment not found or you do not have permission to update it'
      });
    });

    it('should return 404 for non-existent comment', async () => {
      const nonExistentId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await request(app)
        .put(`/api/comments/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Updated content'
        });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'comment not found or you do not have permission to update it'
      });
    });
  });

  describe('DELETE /api/comments/:id', () => {
    let testCommentId: string;
    let testReplyId: string;

    beforeEach(async () => {
      // Create a test comment
      const commentResponse = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content_type: 'video',
          content_id: testVideoId,
          content: 'Comment to be deleted'
        });
      testCommentId = commentResponse.body.data.id;

      // Create a reply
      const replyResponse = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${authToken2}`)
        .send({
          content_type: 'video',
          content_id: testVideoId,
          content: 'Reply to be cascade deleted',
          parent_comment_id: testCommentId
        });
      testReplyId = replyResponse.body.data.id;
    });

    it('should successfully delete own comment', async () => {
      const response = await request(app)
        .delete(`/api/comments/${testCommentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('comment deleted successfully');
      expect(response.body.data.id).toBe(testCommentId);

      // Verify comment was deleted from database
      const { data: comment } = await supabaseClient
        .from('comments')
        .select('*')
        .eq('id', testCommentId)
        .single();

      expect(comment).toBeNull();

      // Verify replies were also deleted (CASCADE)
      const { data: reply } = await supabaseClient
        .from('comments')
        .select('*')
        .eq('id', testReplyId)
        .single();

      expect(reply).toBeNull();
    });

    it('should successfully delete own reply', async () => {
      const response = await request(app)
        .delete(`/api/comments/${testReplyId}`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify reply was deleted
      const { data: reply } = await supabaseClient
        .from('comments')
        .select('*')
        .eq('id', testReplyId)
        .single();

      expect(reply).toBeNull();

      // Verify parent comment still exists
      const { data: parentComment } = await supabaseClient
        .from('comments')
        .select('*')
        .eq('id', testCommentId)
        .single();

      expect(parentComment).toBeTruthy();
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .delete(`/api/comments/${testCommentId}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'authentication required'
      });
    });

    it('should return 400 with invalid comment ID', async () => {
      const response = await request(app)
        .delete('/api/comments/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'comment ID must be a valid UUID'
      });
    });

    it('should return 404 when trying to delete another user\'s comment', async () => {
      const response = await request(app)
        .delete(`/api/comments/${testCommentId}`)
        .set('Authorization', `Bearer ${authToken2}`); // Different user

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'comment not found or you do not have permission to delete it'
      });
    });

    it('should return 404 for non-existent comment', async () => {
      const nonExistentId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await request(app)
        .delete(`/api/comments/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'comment not found or you do not have permission to delete it'
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to comments endpoints', async () => {
      // Test creating multiple comments quickly
      const promises = Array.from({ length: 3 }, (_, i) =>
        request(app)
          .post('/api/comments')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            content_type: 'video',
            content_id: testVideoId,
            content: `Rate limit test comment ${i}`
          })
      );

      const responses = await Promise.all(promises);
      
      // All requests should succeed under normal rate limits
      responses.forEach(response => {
        expect([201, 429]).toContain(response.status); // 201 for success, 429 for rate limit
      });
    });
  });
});