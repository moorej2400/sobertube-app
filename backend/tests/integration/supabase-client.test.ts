/**
 * Supabase Client Configuration Tests
 * Tests for Supabase client initialization and configuration
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { 
  SupabaseClientConfig
} from '../../src/types/supabase';

// Import functions for Supabase client testing
import { 
  createSupabaseClient, 
  getSupabaseClient
} from '../../src/services/supabase';

describe('Supabase Client Configuration', () => {
  describe('Client Initialization', () => {
    test('should create Supabase client with environment configuration', () => {
      const client = createSupabaseClient();
      
      expect(client).toBeInstanceOf(SupabaseClient);
      // Test that client was created successfully (internal properties are protected)
      expect(client).toBeDefined();
      expect(typeof client.from).toBe('function');
      expect(typeof client.auth.getSession).toBe('function');
    });

    test('should create client with custom configuration', () => {
      const customConfig: SupabaseClientConfig = {
        url: 'http://localhost:54321',
        anonKey: 'test-key',
        options: {
          auth: { persistSession: false }
        }
      };
      
      const client = createSupabaseClient(customConfig);
      expect(client).toBeInstanceOf(SupabaseClient);
    });

    test('should throw error with invalid configuration', () => {
      const invalidConfig: SupabaseClientConfig = {
        url: '',
        anonKey: ''
      };
      
      expect(() => createSupabaseClient(invalidConfig)).toThrow();
    });
  });

  describe('Client Singleton Pattern', () => {
    test('should return same client instance on multiple calls', () => {
      const client1 = getSupabaseClient();
      const client2 = getSupabaseClient();
      
      expect(client1).toBe(client2);
      expect(client1).toBeInstanceOf(SupabaseClient);
    });

    test('should initialize client on first call', () => {
      const client = getSupabaseClient();
      expect(client).toBeInstanceOf(SupabaseClient);
    });
  });
});