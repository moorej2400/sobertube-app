/**
 * User Test Data Factory
 * Provides utilities for creating test users with consistent data patterns
 */

import { getSupabaseClient } from '../../src/services/supabase';

export interface TestUserData {
  email: string;
  password: string;
  username: string;
}

export interface TestUser extends TestUserData {
  id?: string;
  accessToken?: string;
  refreshToken?: string;
}

/**
 * Create test user data with unique values
 */
export function createTestUserData(overrides: Partial<TestUserData> = {}): TestUserData {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  
  return {
    email: `testuser_${timestamp}_${randomSuffix}@example.com`,
    password: 'TestPassword123!',
    username: `user_${timestamp}_${randomSuffix}`.substring(0, 20), // Ensure ≤20 chars
    ...overrides
  };
}

/**
 * Register a test user and return user data with tokens
 */
export async function createRegisteredTestUser(
  supertestHelper: any,
  overrides: Partial<TestUserData> = {}
): Promise<TestUser> {
  const userData = createTestUserData(overrides);
  
  // Register user
  const registerResponse = await supertestHelper.post('/api/auth/register', userData);
  
  if (registerResponse.status !== 201) {
    throw new Error(`Failed to register test user: ${registerResponse.body.error}`);
  }
  
  // Login to get tokens
  const loginResponse = await supertestHelper.post('/api/auth/login', {
    email: userData.email,
    password: userData.password
  });
  
  if (loginResponse.status !== 200) {
    throw new Error(`Failed to login test user: ${loginResponse.body.error}`);
  }
  
  return {
    ...userData,
    id: registerResponse.body.user.id,
    accessToken: loginResponse.body.accessToken,
    refreshToken: loginResponse.body.refreshToken
  };
}

/**
 * Create multiple test users
 */
export async function createMultipleTestUsers(
  supertestHelper: any,
  count: number,
  baseOverrides: Partial<TestUserData> = {}
): Promise<TestUser[]> {
  const users: TestUser[] = [];
  
  for (let i = 0; i < count; i++) {
    const user = await createRegisteredTestUser(supertestHelper, {
      ...baseOverrides,
      username: baseOverrides.username ? `${baseOverrides.username}_${i}` : undefined
    });
    users.push(user);
  }
  
  return users;
}

/**
 * Clean up test users from database
 */
export async function cleanupTestUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  
  const supabaseClient = getSupabaseClient();
  
  try {
    // Clean up from users table
    await supabaseClient
      .from('users')
      .delete()
      .in('id', userIds);
      
    // Note: Supabase Auth cleanup would require service role key
    // In production tests, this would be handled by test database reset
  } catch (error) {
    console.warn('Failed to cleanup test users:', error);
  }
}