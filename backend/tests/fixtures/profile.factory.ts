/**
 * Profile Test Data Factory
 * Provides utilities for creating test profiles with consistent data patterns
 */

export interface TestProfileData {
  username: string;
  display_name?: string;
  bio?: string;
  location?: string;
  sobriety_date?: string;
  profile_picture_url?: string;
  privacy_level?: 'public' | 'friends' | 'private';
}

export interface TestProfile extends TestProfileData {
  id?: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Create test profile data
 */
export function createTestProfileData(overrides: Partial<TestProfileData> = {}): TestProfileData {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  
  return {
    username: `profile_${timestamp}_${randomSuffix}`.substring(0, 20), // Ensure ≤20 chars
    display_name: `Test User ${randomSuffix}`,
    bio: `This is a test profile bio created at ${timestamp}. Recovery journey started in 2023.`,
    location: 'Test City, TC',
    sobriety_date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
    profile_picture_url: `https://example.com/profile-${randomSuffix}.jpg`,
    privacy_level: 'public',
    ...overrides
  };
}

/**
 * Create test profile data with specific privacy level
 */
export function createTestProfileByPrivacy(
  privacyLevel: 'public' | 'friends' | 'private',
  overrides: Partial<TestProfileData> = {}
): TestProfileData {
  const baseData = createTestProfileData(overrides);
  
  const privacySpecificData = {
    public: {
      bio: 'Public profile - open to sharing my recovery journey with everyone.',
      display_name: 'Public User'
    },
    friends: {
      bio: 'Friends only profile - sharing with my close support network.',
      display_name: 'Friends User'
    },
    private: {
      bio: 'Private profile - keeping my journey personal.',
      display_name: 'Private User'
    }
  };
  
  return {
    ...baseData,
    ...privacySpecificData[privacyLevel],
    privacy_level: privacyLevel,
    ...overrides
  };
}

/**
 * Create a test profile via API
 */
export async function createTestProfile(
  supertestHelper: any,
  authToken: string,
  overrides: Partial<TestProfileData> = {}
): Promise<TestProfile> {
  const profileData = createTestProfileData(overrides);
  
  const response = await supertestHelper
    .post('/api/profiles', profileData)
    .set('Authorization', `Bearer ${authToken}`);
  
  if (response.status !== 201) {
    throw new Error(`Failed to create test profile: ${response.body.error}`);
  }
  
  return response.body.profile;
}

/**
 * Update a test profile via API
 */
export async function updateTestProfile(
  supertestHelper: any,
  authToken: string,
  updates: Partial<TestProfileData>
): Promise<TestProfile> {
  const response = await supertestHelper
    .put('/api/profiles/me', updates)
    .set('Authorization', `Bearer ${authToken}`);
  
  if (response.status !== 200) {
    throw new Error(`Failed to update test profile: ${response.body.error}`);
  }
  
  return response.body.profile;
}

/**
 * Create profiles with different privacy levels for testing
 */
export async function createTestProfilesWithDifferentPrivacy(
  supertestHelper: any,
  authTokens: string[]
): Promise<{ public: TestProfile; friends: TestProfile; private: TestProfile }> {
  if (authTokens.length < 3) {
    throw new Error('Need at least 3 auth tokens to create profiles with different privacy levels');
  }
  
  const [publicToken, friendsToken, privateToken] = authTokens;
  
  const publicProfile = await createTestProfile(
    supertestHelper,
    publicToken,
    createTestProfileByPrivacy('public')
  );
  
  const friendsProfile = await createTestProfile(
    supertestHelper,
    friendsToken,
    createTestProfileByPrivacy('friends')
  );
  
  const privateProfile = await createTestProfile(
    supertestHelper,
    privateToken,
    createTestProfileByPrivacy('private')
  );
  
  return {
    public: publicProfile,
    friends: friendsProfile,
    private: privateProfile
  };
}

/**
 * Create a complete user journey (user + profile)
 */
export async function createCompleteTestUser(
  supertestHelper: any,
  userOverrides: any = {},
  profileOverrides: Partial<TestProfileData> = {}
): Promise<{ user: any; profile: TestProfile }> {
  const { createRegisteredTestUser } = await import('./user.factory');
  
  // Create and register user
  const user = await createRegisteredTestUser(supertestHelper, userOverrides);
  
  // Create profile for user
  const profile = await createTestProfile(
    supertestHelper,
    user.accessToken!,
    profileOverrides
  );
  
  return { user, profile };
}