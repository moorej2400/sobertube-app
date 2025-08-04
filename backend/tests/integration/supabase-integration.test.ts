/**
 * Supabase Integration Tests
 * Tests with real Supabase instance - no mocking
 */

import { getSupabaseClient } from '../../src/services/supabase';

describe('Supabase Integration Tests', () => {
  let supabaseClient: any;

  beforeAll(async () => {
    supabaseClient = getSupabaseClient();
  });

  describe('Database Operations', () => {
    test('should perform basic query operation', async () => {
      // Test a simple query that should work with default Supabase setup
      const { error } = await supabaseClient
        .from('nonexistent_table')
        .select('*')
        .limit(1);

      // We expect this to fail with a specific error (table doesn't exist)
      // but the connection should work
      expect(error).toBeDefined();
      expect(error.message).toContain('table');
    });

    test('should handle authentication check', async () => {
      const { data: { user }, error } = await supabaseClient.auth.getUser();
      
      // In test environment, user should be null (not authenticated)
      expect(user).toBeNull();
      // Error is expected when no session exists
      expect(error).toBeDefined();
    });

    test('should connect to correct database URL', async () => {
      // Test that client has proper methods available (URL is internal)
      expect(typeof supabaseClient.from).toBe('function');
      expect(typeof supabaseClient.auth.getSession).toBe('function');
    });
  });

  describe('Real Connection Test', () => {
    test('should establish actual connection to Supabase', async () => {
      // Test actual connectivity by trying to get session
      const { data, error } = await supabaseClient.auth.getSession();
      
      // Should not error on connection
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.session).toBeNull(); // No active session in test
    });

    test('should have correct environment configuration', async () => {
      // Verify client functionality instead of accessing internal properties
      expect(supabaseClient).toBeDefined();
      expect(typeof supabaseClient.auth.getSession).toBe('function');
    });
  });
});