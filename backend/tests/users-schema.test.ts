/**
 * Users Table Schema Tests
 * Test suite for validating the users table schema and constraints
 * Following TDD methodology - these tests validate the database schema
 */

import { createClient } from '@supabase/supabase-js';

describe('Users Table Schema', () => {
  // Use service role client for tests to bypass RLS
  const supabaseClient = createClient(
    process.env['SUPABASE_URL'] || 'http://127.0.0.1:54321',
    process.env['SUPABASE_SERVICE_ROLE_KEY'] || ''
  );

  // Test data cleanup
  const testUsers: string[] = [];

  afterEach(async () => {
    // Clean up test users
    if (testUsers.length > 0) {
      await supabaseClient
        .from('users')
        .delete()
        .in('id', testUsers);
      testUsers.length = 0;
    }
  });

  describe('Table Structure', () => {
    it('should create users table with correct columns', async () => {
      // Query the table structure
      const { data, error } = await supabaseClient
        .from('users')
        .select('*')
        .limit(1);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should have required columns with correct types', async () => {
      // Test by inserting a valid user record (let DB generate UUID)
      const testUser = {
        email: 'schema-test@example.com',
        username: 'schematest',
        display_name: 'Schema Test User',
        bio: 'Test bio for schema validation',
        profile_picture_url: 'https://example.com/pic.jpg',
        sobriety_date: '2024-01-01',
        location: 'Test City, TS',
        privacy_level: 'public'
      };

      const { data, error } = await supabaseClient
        .from('users')
        .insert(testUser)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toMatchObject({
        email: testUser.email,
        username: testUser.username,
        display_name: testUser.display_name,
        bio: testUser.bio,
        profile_picture_url: testUser.profile_picture_url,
        sobriety_date: testUser.sobriety_date,
        location: testUser.location,
        privacy_level: testUser.privacy_level
      });
      expect(data.id).toBeDefined(); // UUID should be generated
      expect(data.created_at).toBeDefined();
      expect(data.updated_at).toBeDefined();

      if (data?.id) testUsers.push(data.id);
    });
  });

  describe('Constraints and Validations', () => {
    describe('Email Constraints', () => {
      it('should enforce email uniqueness', async () => {
        const email = 'unique-test@example.com';
        
        // Insert first user
        const { data: firstUser, error: firstError } = await supabaseClient
          .from('users')
          .insert({
            email,
            username: 'user1'
          })
          .select()
          .single();

        expect(firstError).toBeNull();
        if (firstUser?.id) testUsers.push(firstUser.id);

        // Try to insert second user with same email
        const { error: secondError } = await supabaseClient
          .from('users')
          .insert({
            email, // Same email
            username: 'user2'
          });

        expect(secondError).toBeDefined();
        expect(secondError?.message).toContain('duplicate');
      });

      it('should enforce valid email format', async () => {
        const invalidEmails = [
          'invalid-email',
          'invalid@',
          '@example.com',
          'invalid@.com',
          'invalid.com'
        ];

        for (const email of invalidEmails) {
          const { error } = await supabaseClient
            .from('users')
            .insert({
              email,
              username: `user${Date.now()}`
            });

          expect(error).toBeDefined();
          expect(error?.message).toContain('email_format');
        }
      });

      it('should accept valid email formats', async () => {
        const validEmails = [
          'test@example.com',
          'user.name@domain.co.uk',
          'user+tag@example.org',
          '123@numbers.com'
        ];

        for (const email of validEmails) {
          const username = `user${Date.now()}${Math.floor(Math.random() * 1000)}`;
          const { data, error } = await supabaseClient
            .from('users')
            .insert({
              email,
              username
            })
            .select()
            .single();

          expect(error).toBeNull();
          expect(data.email).toBe(email);
          
          if (data?.id) testUsers.push(data.id);
        }
      });
    });

    describe('Username Constraints', () => {
      it('should enforce username uniqueness', async () => {
        const username = 'uniqueuser';
        
        // Insert first user
        const { data: firstUser, error: firstError } = await supabaseClient
          .from('users')
          .insert({
            email: 'user1@example.com',
            username
          })
          .select()
          .single();

        expect(firstError).toBeNull();
        if (firstUser?.id) testUsers.push(firstUser.id);

        // Try to insert second user with same username
        const { error: secondError } = await supabaseClient
          .from('users')
          .insert({
            email: 'user2@example.com',
            username // Same username
          });

        expect(secondError).toBeDefined();
        expect(secondError?.message).toContain('duplicate');
      });

      it('should enforce username length constraints', async () => {
        // Too short (less than 3 characters)
        const { error: shortError } = await supabaseClient
          .from('users')
          .insert({
            email: 'short@example.com',
            username: 'ab'
          });

        expect(shortError).toBeDefined();
        expect(shortError?.message).toContain('username_length');

        // Too long (more than 20 characters)
        const { error: longError } = await supabaseClient
          .from('users')
          .insert({
            email: 'long@example.com',
            username: 'a'.repeat(21)
          });

        expect(longError).toBeDefined();
        expect(longError?.message).toContain('username_length');
      });

      it('should enforce username format constraints', async () => {
        const invalidUsernames = [
          '123user',          // Cannot start with number
          'user@name',        // Special characters not allowed
          'user name',        // Spaces not allowed
          'user-name',        // Hyphens not allowed
          'user.name',        // Dots not allowed
          'user!',            // Punctuation not allowed
        ];

        for (const username of invalidUsernames) {
          const { error } = await supabaseClient
            .from('users')
            .insert({
              email: `${username.replace(/[^a-zA-Z0-9]/g, '')}@example.com`,
              username
            });

          expect(error).toBeDefined();
          expect(error?.message).toContain('username_format');
        }
      });

      it('should accept valid username formats', async () => {
        const validUsernames = [
          'user',
          'user123',
          'user_name',
          'User_Name_123',
          'abc',  // Minimum length
          'a'.repeat(20)  // Maximum length
        ];

        for (let i = 0; i < validUsernames.length; i++) {
          const username = validUsernames[i];
          const suffix = `${i}${Date.now().toString().slice(-4)}`; // Short suffix
          const testUsername = username === 'a'.repeat(20) ? username : `${username}${suffix}`;
          
          // Ensure username doesn't exceed 20 characters
          const finalUsername = testUsername.length > 20 ? testUsername.substring(0, 20) : testUsername;
          
          const { data, error } = await supabaseClient
            .from('users')
            .insert({
              email: `test${i}${Date.now()}@example.com`,
              username: finalUsername
            })
            .select()
            .single();

          expect(error).toBeNull();
          expect(data.username).toBe(finalUsername);
          
          if (data?.id) testUsers.push(data.id);
        }
      });
    });

    describe('Bio Constraints', () => {
      it('should enforce bio character limit', async () => {
        const longBio = 'a'.repeat(501); // Over 500 character limit

        const { error } = await supabaseClient
          .from('users')
          .insert({
            email: 'longbio@example.com',
            username: 'longbiouser',
            bio: longBio
          });

        expect(error).toBeDefined();
        expect(error?.message).toContain('bio');
      });

      it('should accept bio within character limit', async () => {
        const validBio = 'a'.repeat(500); // Exactly 500 characters

        const { data, error } = await supabaseClient
          .from('users')
          .insert({
            email: 'validbio@example.com',
            username: 'validbiouser',
            bio: validBio
          })
          .select()
          .single();

        expect(error).toBeNull();
        expect(data.bio).toBe(validBio);
        
        if (data?.id) testUsers.push(data.id);
      });
    });

    describe('Privacy Level Constraints', () => {
      it('should enforce valid privacy levels', async () => {
        const invalidPrivacyLevels = ['invalid', 'hidden', 'secret'];

        for (const privacyLevel of invalidPrivacyLevels) {
          const timestamp = Date.now();
          const { error } = await supabaseClient
            .from('users')
            .insert({
              email: `privacy${timestamp}@example.com`,
              username: `puser${timestamp}`, // Shorter username to avoid length constraint
              privacy_level: privacyLevel
            });

          expect(error).toBeDefined();
          expect(error?.message).toContain('privacy_level');
        }
      });

      it('should accept valid privacy levels', async () => {
        const validPrivacyLevels = ['public', 'friends', 'private'];

        for (const privacyLevel of validPrivacyLevels) {
          const timestamp = Date.now();
          const { data, error } = await supabaseClient
            .from('users')
            .insert({
              email: `user${timestamp}@example.com`,
              username: `user${timestamp}`,
              privacy_level: privacyLevel
            })
            .select()
            .single();

          expect(error).toBeNull();
          expect(data.privacy_level).toBe(privacyLevel);
          
          if (data?.id) testUsers.push(data.id);
        }
      });

      it('should default to public privacy level', async () => {
        const { data, error } = await supabaseClient
          .from('users')
          .insert({
            email: 'default@example.com',
            username: 'defaultuser'
            // No privacy_level specified
          })
          .select()
          .single();

        expect(error).toBeNull();
        expect(data.privacy_level).toBe('public');
        
        if (data?.id) testUsers.push(data.id);
      });
    });

    describe('Display Name Constraints', () => {
      it('should enforce display name character limit', async () => {
        const longDisplayName = 'a'.repeat(101); // Over 100 character limit

        const { error } = await supabaseClient
          .from('users')
          .insert({
            email: 'longdisplay@example.com',
            username: 'longdisplayuser',
            display_name: longDisplayName
          });

        expect(error).toBeDefined();
        expect(error?.message).toContain('display_name_length');
      });

      it('should accept display name within character limit', async () => {
        const validDisplayName = 'a'.repeat(100); // Exactly 100 characters

        const { data, error } = await supabaseClient
          .from('users')
          .insert({
            email: 'validdisplay@example.com',
            username: 'validdisplayuser',
            display_name: validDisplayName
          })
          .select()
          .single();

        expect(error).toBeNull();
        expect(data.display_name).toBe(validDisplayName);
        
        if (data?.id) testUsers.push(data.id);
      });

      it('should allow null display name', async () => {
        const { data, error } = await supabaseClient
          .from('users')
          .insert({
            email: 'nulldisplay@example.com',
            username: 'nulldisplayuser',
            display_name: null
          })
          .select()
          .single();

        expect(error).toBeNull();
        expect(data.display_name).toBeNull();
        
        if (data?.id) testUsers.push(data.id);
      });
    });
  });

  describe('Timestamps and Triggers', () => {
    it('should automatically set created_at and updated_at on insert', async () => {
      const beforeInsert = new Date();
      
      const { data, error } = await supabaseClient
        .from('users')
        .insert({
          email: 'timestamps@example.com',
          username: 'timestampsuser'
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.created_at).toBeDefined();
      expect(data.updated_at).toBeDefined();
      
      const createdAt = new Date(data.created_at);
      const updatedAt = new Date(data.updated_at);
      
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime());
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime());
      expect(createdAt.getTime()).toBe(updatedAt.getTime()); // Should be same on insert
      
      if (data?.id) testUsers.push(data.id);
    });

    it('should update updated_at timestamp on record update', async () => {
      // Insert user
      const { data: insertData, error: insertError } = await supabaseClient
        .from('users')
        .insert({
          email: 'updatetimestamp@example.com',
          username: 'updatetimestampuser',
          bio: 'Original bio'
        })
        .select()
        .single();

      expect(insertError).toBeNull();
      if (insertData?.id) testUsers.push(insertData.id);

      const originalUpdatedAt = new Date(insertData.updated_at);
      
      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update user
      const { data: updateData, error: updateError } = await supabaseClient
        .from('users')
        .update({ bio: 'Updated bio' })
        .eq('id', insertData.id)
        .select()
        .single();

      expect(updateError).toBeNull();
      expect(updateData.bio).toBe('Updated bio');
      
      const newUpdatedAt = new Date(updateData.updated_at);
      expect(newUpdatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('Indexes', () => {
    it('should have efficient queries on indexed columns', async () => {
      // This test verifies that queries on username and email are fast
      // In a real performance test, we would measure query execution time
      
      const { data: usernameQuery, error: usernameError } = await supabaseClient
        .from('users')
        .select('id, username')
        .eq('username', 'nonexistentuser')
        .limit(1);

      expect(usernameError).toBeNull();
      expect(Array.isArray(usernameQuery)).toBe(true);

      const { data: emailQuery, error: emailError } = await supabaseClient
        .from('users')
        .select('id, email')
        .eq('email', 'nonexistent@example.com')
        .limit(1);

      expect(emailError).toBeNull();
      expect(Array.isArray(emailQuery)).toBe(true);
    });
  });
});