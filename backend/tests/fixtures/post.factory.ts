/**
 * Post Test Data Factory
 * Provides utilities for creating test posts with consistent data patterns
 */

import { PostType } from '../../src/types/supabase';

export interface TestPostData {
  content: string;
  post_type?: PostType;
  image_url?: string;
}

export interface TestPost extends TestPostData {
  id?: string;
  user_id?: string;
  likes_count?: number;
  comments_count?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Create test post data
 */
export function createTestPostData(overrides: Partial<TestPostData> = {}): TestPostData {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  
  return {
    content: `Test post content ${timestamp} ${randomSuffix}. This is a sample recovery update for testing purposes.`,
    post_type: 'Recovery Update',
    image_url: null,
    ...overrides
  };
}

/**
 * Create test post data for specific post types
 */
export function createTestPostByType(postType: PostType, customContent?: string): TestPostData {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  
  const contentByType = {
    'Recovery Update': `Day ${Math.floor(Math.random() * 365)} of sobriety! Feeling grateful today. ${timestamp}`,
    'Milestone': `Celebrating ${Math.floor(Math.random() * 12) + 1} months sober! ${timestamp}`,
    'Inspiration': `"The only way out is through." - Robert Frost. Stay strong everyone! ${timestamp}`,
    'Question': `How do you handle cravings when you're feeling stressed? Looking for advice. ${timestamp}`,
    'Gratitude': `Today I'm grateful for my support system and second chances. ${timestamp}`
  };
  
  return {
    content: customContent || contentByType[postType],
    post_type: postType,
    image_url: postType === 'Inspiration' ? `https://example.com/inspiration-${randomSuffix}.jpg` : null
  };
}

/**
 * Create a test post via API
 */
export async function createTestPost(
  supertestHelper: any,
  authToken: string,
  overrides: Partial<TestPostData> = {}
): Promise<TestPost> {
  const postData = createTestPostData(overrides);
  
  const response = await supertestHelper
    .post('/api/posts', postData)
    .set('Authorization', `Bearer ${authToken}`);
  
  if (response.status !== 201) {
    throw new Error(`Failed to create test post: ${response.body.error}`);
  }
  
  return response.body.post;
}

/**
 * Create multiple test posts
 */
export async function createMultipleTestPosts(
  supertestHelper: any,
  authToken: string,
  count: number,
  baseOverrides: Partial<TestPostData> = {}
): Promise<TestPost[]> {
  const posts: TestPost[] = [];
  
  for (let i = 0; i < count; i++) {
    // Add slight delay to ensure different timestamps
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    const post = await createTestPost(supertestHelper, authToken, {
      ...baseOverrides,
      content: baseOverrides.content ? `${baseOverrides.content} - Post ${i + 1}` : undefined
    });
    posts.push(post);
  }
  
  return posts;
}

/**
 * Create posts of different types for testing
 */
export async function createTestPostsOfAllTypes(
  supertestHelper: any,
  authToken: string
): Promise<{ [key in PostType]: TestPost }> {
  const postTypes: PostType[] = ['Recovery Update', 'Milestone', 'Inspiration', 'Question', 'Gratitude'];
  const posts: Partial<{ [key in PostType]: TestPost }> = {};
  
  for (const postType of postTypes) {
    const postData = createTestPostByType(postType);
    const post = await createTestPost(supertestHelper, authToken, postData);
    posts[postType] = post;
    
    // Small delay between posts
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  return posts as { [key in PostType]: TestPost };
}

/**
 * Clean up test posts from database
 */
export async function cleanupTestPosts(postIds: string[]): Promise<void> {
  if (postIds.length === 0) return;
  
  const { getSupabaseClient } = await import('../../src/services/supabase');
  const supabaseClient = getSupabaseClient();
  
  try {
    await supabaseClient
      .from('posts')
      .delete()
      .in('id', postIds);
  } catch (error) {
    console.warn('Failed to cleanup test posts:', error);
  }
}