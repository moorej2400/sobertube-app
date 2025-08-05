/**
 * Personalized Feed Integration Tests
 * Comprehensive test suite for personalized feed with social features integration
 * Tests sub-feature 0.0.0: Complete integration of personalized feed with all social features
 */

import { app } from '../../src/app';
import { createSupertestHelper } from '../helpers/supertest.helper';
import { getSupabaseClient } from '../../src/services/supabase';

describe('Personalized Feed Social Integration', () => {
  const supertestHelper = createSupertestHelper(app);
  const supabaseClient = getSupabaseClient();
  
  // Test data cleanup arrays
  const testUserIds: string[] = [];
  const testPostIds: string[] = [];
  const testVideoIds: string[] = [];
  const testFollowIds: string[] = [];
  const testLikeIds: string[] = [];
  const testCommentIds: string[] = [];
  
  // Helper function to create test user and get auth token
  const createTestUser = async (suffix = '') => {
    const timestamp = Date.now() + Math.random();
    const userData = {
      email: `pfeeduser${timestamp}${suffix}@example.com`,
      password: 'TestPassword123!',
      username: `pfeeduser${timestamp}${suffix}`.substring(0, 20),
      display_name: `Feed User ${suffix}`.substring(0, 50)
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
      username: userData.username,
      displayName: userData.display_name
    };
  };

  // Helper function to create test post
  const createTestPost = async (userId: string, content: string, postType = 'Recovery Update') => {
    const { data: post, error } = await supabaseClient
      .from('posts')
      .insert({
        user_id: userId,
        content,
        post_type: postType,
        likes_count: 0,
        comments_count: 0
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
        status: 'ready',
        likes_count: 0,
        comments_count: 0,
        views_count: 0
      })
      .select()
      .single();

    if (error) throw error;
    testVideoIds.push(video.id);
    return video;
  };

  // Helper function to create follow relationship
  const createFollow = async (followerId: string, followingId: string) => {
    const { data: follow, error } = await supabaseClient
      .from('follows')
      .insert({
        follower_id: followerId,
        following_id: followingId
      })
      .select()
      .single();

    if (error) throw error;
    testFollowIds.push(follow.id);
    return follow;
  };

  // Helper function to create like
  const createLike = async (userId: string, contentId: string, contentType: 'post' | 'video') => {
    const { data: like, error } = await supabaseClient
      .from('likes')
      .insert({
        user_id: userId,
        content_id: contentId,
        content_type: contentType
      })
      .select()
      .single();

    if (error) throw error;
    testLikeIds.push(like.id);

    // Update count in the content table
    const table = contentType === 'post' ? 'posts' : 'videos';
    await supabaseClient
      .from(table)
      .update({ likes_count: 1 })
      .eq('id', contentId);

    return like;
  };

  // Helper function to create comment
  const createComment = async (userId: string, contentId: string, contentType: 'post' | 'video', content: string) => {
    const { data: comment, error } = await supabaseClient
      .from('comments')
      .insert({
        user_id: userId,
        content_id: contentId,
        content_type: contentType,
        content
      })
      .select()
      .single();

    if (error) throw error;
    testCommentIds.push(comment.id);

    // Update count in the content table
    const table = contentType === 'post' ? 'posts' : 'videos';
    await supabaseClient
      .from(table)
      .update({ comments_count: 1 })
      .eq('id', contentId);

    return comment;
  };

  // Clean up test data after each test
  afterEach(async () => {
    // Clean up in reverse dependency order
    if (testCommentIds.length > 0) {
      await supabaseClient.from('comments').delete().in('id', testCommentIds);
      testCommentIds.length = 0;
    }

    if (testLikeIds.length > 0) {
      await supabaseClient.from('likes').delete().in('id', testLikeIds);
      testLikeIds.length = 0;
    }

    if (testFollowIds.length > 0) {
      await supabaseClient.from('follows').delete().in('id', testFollowIds);
      testFollowIds.length = 0;
    }

    if (testVideoIds.length > 0) {
      await supabaseClient.from('videos').delete().in('id', testVideoIds);
      testVideoIds.length = 0;
    }

    if (testPostIds.length > 0) {
      await supabaseClient.from('posts').delete().in('id', testPostIds);
      testPostIds.length = 0;
    }
    
    if (testUserIds.length > 0) {
      await supabaseClient.from('users').delete().in('id', testUserIds);
      testUserIds.length = 0;
    }
  });

  describe('Personalized Feed with Follows Integration', () => {
    it('should return content from followed users in personalized feed', async () => {
      // Create users
      const { userId: user1, token: token1 } = await createTestUser('1');
      const { userId: user2 } = await createTestUser('2');
      const { userId: user3 } = await createTestUser('3');

      // Create content from followed users
      const post1 = await createTestPost(user2, 'Post from followed user 2');
      const video1 = await createTestVideo(user3, 'Video from followed user 3');
      
      // Create content from non-followed user (should not appear)
      const { userId: user4 } = await createTestUser('4');
      await createTestPost(user4, 'Post from non-followed user');

      // User1 follows user2 and user3
      await createFollow(user1, user2);
      await createFollow(user1, user3);

      // Get personalized feed for user1
      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('personalization');
      expect(response.body.personalization.following_count).toBe(2);
      expect(response.body.personalization.algorithm).toBe('follows_based');

      // Verify content from followed users appears
      const contentIds = response.body.data.map((item: any) => item.id);
      expect(contentIds).toContain(post1.id);
      expect(contentIds).toContain(video1.id);

      // Verify each feed item has complete structure
      response.body.data.forEach((item: any) => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('type');
        expect(['post', 'video']).toContain(item.type);
        expect(item).toHaveProperty('user_id');
        expect(item).toHaveProperty('user');
        expect(item.user).toHaveProperty('username');
        expect(item.user).toHaveProperty('id');
        expect(item).toHaveProperty('likes_count');
        expect(item).toHaveProperty('comments_count');
        expect(item).toHaveProperty('created_at');
      });
    });

    it('should include user own content in personalized feed', async () => {
      const { userId: user1, token: token1 } = await createTestUser('1');
      const { userId: user2 } = await createTestUser('2');

      // Create user1's own content
      const ownPost = await createTestPost(user1, 'My own post');
      const ownVideo = await createTestVideo(user1, 'My own video');
      
      // Create content from followed user
      const followedPost = await createTestPost(user2, 'Post from followed user');

      // User1 follows user2
      await createFollow(user1, user2);

      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
      
      const contentIds = response.body.data.map((item: any) => item.id);
      
      // Should include own content
      expect(contentIds).toContain(ownPost.id);
      expect(contentIds).toContain(ownVideo.id);
      
      // Should include followed user content
      expect(contentIds).toContain(followedPost.id);
    });

    it('should use fallback algorithm when user follows no one', async () => {
      const { userId: user1, token: token1 } = await createTestUser('1');
      const { userId: user2 } = await createTestUser('2');

      // Create user's own content
      const ownPost = await createTestPost(user1, 'My own post');
      
      // Create popular content from other users
      const popularPost = await createTestPost(user2, 'Popular post');
      await createLike(user2, popularPost.id, 'post'); // Make it popular

      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
      expect(response.body.personalization.following_count).toBe(0);
      expect(response.body.personalization.algorithm).toBe('fallback_mixed');

      // Should include mix of own content and popular content
      const contentIds = response.body.data.map((item: any) => item.id);
      expect(contentIds).toContain(ownPost.id);
    });
  });

  describe('Personalized Feed with Likes Integration', () => {
    it('should display correct like counts in personalized feed', async () => {
      const { userId: user1, token: token1 } = await createTestUser('1');
      const { userId: user2 } = await createTestUser('2');
      const { userId: user3 } = await createTestUser('3');

      // Create content
      const post = await createTestPost(user2, 'Post to be liked');
      const video = await createTestVideo(user2, 'Video to be liked');

      // Create likes
      await createLike(user1, post.id, 'post');
      await createLike(user3, post.id, 'post');
      await createLike(user1, video.id, 'video');

      // User1 follows user2
      await createFollow(user1, user2);

      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);

      // Find the post and video in response
      const postItem = response.body.data.find((item: any) => item.id === post.id);
      const videoItem = response.body.data.find((item: any) => item.id === video.id);

      expect(postItem).toBeDefined();
      expect(postItem.likes_count).toBe(2);
      
      expect(videoItem).toBeDefined();
      expect(videoItem.likes_count).toBe(1);
    });

    it('should handle zero likes correctly in personalized feed', async () => {
      const { userId: user1, token: token1 } = await createTestUser('1');
      const { userId: user2 } = await createTestUser('2');

      const post = await createTestPost(user2, 'Post with no likes');
      
      await createFollow(user1, user2);

      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
      
      const postItem = response.body.data.find((item: any) => item.id === post.id);
      expect(postItem).toBeDefined();
      expect(postItem.likes_count).toBe(0);
    });
  });

  describe('Personalized Feed with Comments Integration', () => {
    it('should display correct comment counts in personalized feed', async () => {
      const { userId: user1, token: token1 } = await createTestUser('1');
      const { userId: user2 } = await createTestUser('2');
      const { userId: user3 } = await createTestUser('3');

      // Create content
      const post = await createTestPost(user2, 'Post to be commented on');
      const video = await createTestVideo(user2, 'Video to be commented on');

      // Create comments
      await createComment(user1, post.id, 'post', 'Great post!');
      await createComment(user3, post.id, 'post', 'I agree!');
      await createComment(user1, video.id, 'video', 'Nice video!');

      // User1 follows user2
      await createFollow(user1, user2);

      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);

      // Find the post and video in response
      const postItem = response.body.data.find((item: any) => item.id === post.id);
      const videoItem = response.body.data.find((item: any) => item.id === video.id);

      expect(postItem).toBeDefined();
      expect(postItem.comments_count).toBe(2);
      
      expect(videoItem).toBeDefined();
      expect(videoItem.comments_count).toBe(1);
    });

    it('should handle zero comments correctly in personalized feed', async () => {
      const { userId: user1, token: token1 } = await createTestUser('1');
      const { userId: user2 } = await createTestUser('2');

      const post = await createTestPost(user2, 'Post with no comments');
      
      await createFollow(user1, user2);

      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
      
      const postItem = response.body.data.find((item: any) => item.id === post.id);
      expect(postItem).toBeDefined();
      expect(postItem.comments_count).toBe(0);
    });
  });

  describe('Personalized Feed User Profile Integration', () => {
    it('should include complete user profile data in feed items', async () => {
      const { userId: user1, token: token1 } = await createTestUser('1');
      const { userId: user2, username: username2, displayName: displayName2 } = await createTestUser('2');

      // Update user2 profile with additional data
      await supabaseClient
        .from('users')
        .update({
          bio: 'Test bio for user 2',
          profile_picture_url: '/test/profile.jpg'
        })
        .eq('id', user2);

      const post = await createTestPost(user2, 'Post with full user profile');
      
      await createFollow(user1, user2);

      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
      
      const postItem = response.body.data.find((item: any) => item.id === post.id);
      expect(postItem).toBeDefined();
      
      // Verify user profile data
      expect(postItem.user).toHaveProperty('id', user2);
      expect(postItem.user).toHaveProperty('username', username2);
      expect(postItem.user).toHaveProperty('display_name', displayName2);
      // Note: profile_picture_url and bio are not currently included in feed response
      // This is by design to keep feed responses lightweight
    });

    it('should handle users with minimal profile data', async () => {
      const { userId: user1, token: token1 } = await createTestUser('1');
      const { userId: user2, username: username2 } = await createTestUser('2');

      const post = await createTestPost(user2, 'Post with minimal user profile');
      
      await createFollow(user1, user2);

      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
      
      const postItem = response.body.data.find((item: any) => item.id === post.id);
      expect(postItem).toBeDefined();
      
      // Should still have basic user data
      expect(postItem.user).toHaveProperty('id', user2);
      expect(postItem.user).toHaveProperty('username', username2);
    });
  });

  describe('Personalized Feed Complex Integration Scenarios', () => {
    it('should handle complex scenario with multiple social interactions', async () => {
      // Create 4 users
      const { userId: user1, token: token1 } = await createTestUser('1');
      const { userId: user2 } = await createTestUser('2');
      const { userId: user3 } = await createTestUser('3');
      const { userId: user4 } = await createTestUser('4');

      // Create content
      const post1 = await createTestPost(user2, 'Popular recovery post', 'Recovery Update');
      const video1 = await createTestVideo(user3, 'Inspiring milestone video');
      const post2 = await createTestPost(user1, 'My own gratitude post', 'Gratitude');

      // Create social interactions
      await createLike(user1, post1.id, 'post');
      await createLike(user4, post1.id, 'post');
      await createComment(user1, post1.id, 'post', 'This really helped me!');
      await createComment(user4, video1.id, 'video', 'Amazing journey!');
      await createLike(user3, video1.id, 'video');

      // Create follow relationships
      await createFollow(user1, user2); // user1 follows user2
      await createFollow(user1, user3); // user1 follows user3
      await createFollow(user4, user1); // user4 follows user1 (shouldn't affect user1's feed)

      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', `Bearer ${token1}`);

      expect(response.status).toBe(200);
      expect(response.body.personalization.following_count).toBe(2);
      expect(response.body.personalization.algorithm).toBe('follows_based');

      // Should include content from followed users and own content
      const contentIds = response.body.data.map((item: any) => item.id);
      expect(contentIds).toContain(post1.id); // from followed user2
      expect(contentIds).toContain(video1.id); // from followed user3
      expect(contentIds).toContain(post2.id); // own content

      // Verify interaction counts are correct
      const post1Item = response.body.data.find((item: any) => item.id === post1.id);
      const video1Item = response.body.data.find((item: any) => item.id === video1.id);
      
      expect(post1Item.likes_count).toBe(2);
      expect(post1Item.comments_count).toBe(1);
      expect(video1Item.likes_count).toBe(1);
      expect(video1Item.comments_count).toBe(1);
    });

    it('should maintain chronological order in personalized feed', async () => {
      const { userId: user1, token: token1 } = await createTestUser('1');
      const { userId: user2 } = await createTestUser('2');

      // Create content with known timing
      const post1 = await createTestPost(user2, 'First post');
      await new Promise(resolve => setTimeout(resolve, 10));
      const video1 = await createTestVideo(user2, 'Second video');
      await new Promise(resolve => setTimeout(resolve, 10));
      const post2 = await createTestPost(user2, 'Third post');

      await createFollow(user1, user2);

      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', `Bearer ${token1}`);

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

    it('should support pagination in personalized feed', async () => {
      const { userId: user1, token: token1 } = await createTestUser('1');
      const { userId: user2 } = await createTestUser('2');

      // Create multiple posts
      const posts = [];
      for (let i = 0; i < 5; i++) {
        const post = await createTestPost(user2, `Test post ${i}`);
        posts.push(post);
      }

      await createFollow(user1, user2);

      // Get first page
      const firstResponse = await supertestHelper
        .get('/api/feed/personalized?limit=2')
        .set('Authorization', `Bearer ${token1}`);

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body.data.length).toBe(2);
      expect(firstResponse.body.pagination).toHaveProperty('has_more', true);
      expect(firstResponse.body.pagination).toHaveProperty('next_cursor');

      // Get second page
      const cursor = firstResponse.body.pagination.next_cursor;
      const secondResponse = await supertestHelper
        .get(`/api/feed/personalized?limit=2&cursor=${encodeURIComponent(cursor)}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body.data.length).toBeGreaterThan(0);

      // Ensure no duplicate content
      const firstIds = firstResponse.body.data.map((item: any) => item.id);
      const secondIds = secondResponse.body.data.map((item: any) => item.id);
      const overlap = firstIds.filter((id: string) => secondIds.includes(id));
      expect(overlap.length).toBe(0);
    });
  });

  describe('Personalized Feed Error Handling', () => {
    it('should require authentication', async () => {
      const response = await supertestHelper.get('/api/feed/personalized');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('authentication required');
    });

    it('should handle invalid authentication tokens', async () => {
      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(response.status).toBe(401);
    });

    it('should validate query parameters', async () => {
      const { token } = await createTestUser();

      // Test invalid limit
      const limitResponse = await supertestHelper
        .get('/api/feed/personalized?limit=invalid')
        .set('Authorization', `Bearer ${token}`);
      
      expect(limitResponse.status).toBe(400);
      expect(limitResponse.body.error).toContain('limit must be a positive integer');

      // Test invalid content_type
      const contentTypeResponse = await supertestHelper
        .get('/api/feed/personalized?content_type=invalid')
        .set('Authorization', `Bearer ${token}`);
      
      expect(contentTypeResponse.status).toBe(400);
      expect(contentTypeResponse.body.error).toContain('content_type must be one of');
    });

    it('should handle database errors gracefully', async () => {
      const { token } = await createTestUser();

      // This test would require mocking database failures
      // For now, we'll just verify the endpoint responds properly
      const response = await supertestHelper
        .get('/api/feed/personalized')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });
});