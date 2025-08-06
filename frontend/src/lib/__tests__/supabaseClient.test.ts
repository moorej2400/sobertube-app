/**
 * Tests for Supabase Client Configuration
 * Testing connection to local self-hosted Supabase services
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock environment variables before importing the client
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_SUPABASE_URL: 'http://localhost:8000',
    VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    VITE_DEBUG_MODE: 'true'
  }
});

// Mock fetch for connection testing
global.fetch = vi.fn();

import { 
  supabase, 
  checkSupabaseConnection, 
  testConnections, 
  supabaseClientUrl, 
  supabaseClientKey, 
  supabaseOptions,
  getSupabaseConfig
} from '../supabaseClient';

describe('Supabase Client', () => {
  beforeEach(() => {
    // Reset all mocks between tests
    vi.clearAllMocks();
  });

  describe('Client Initialization', () => {
    it('should initialize Supabase client with correct configuration', () => {
      expect(supabase).toBeDefined();
      expect(supabaseClientUrl).toBe('http://localhost:8000');
      expect(supabaseClientKey).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0');
    });

    it('should have proper client configuration for local services', () => {
      const clientOptions = supabaseOptions;
      expect(clientOptions).toBeDefined();
      expect(clientOptions.auth).toBeDefined();
      expect(clientOptions.realtime).toBeDefined();
    });

    it('should provide configuration helper function', () => {
      const config = getSupabaseConfig();
      expect(config).toBeDefined();
      expect(config.url).toBe('http://localhost:8000');
      expect(config.endpoints).toBeDefined();
      expect(config.endpoints.postgrest).toBe('http://localhost:3000');
      expect(config.endpoints.auth).toBe('http://localhost:9999');
    });
  });

  describe('Connection Functions', () => {
    it('should provide checkSupabaseConnection function', () => {
      expect(checkSupabaseConnection).toBeDefined();
      expect(typeof checkSupabaseConnection).toBe('function');
    });

    it('should provide testConnections function for all services', () => {
      expect(testConnections).toBeDefined();
      expect(typeof testConnections).toBe('function');
    });
  });

  describe('Service Endpoints', () => {
    it('should configure correct PostgREST endpoint', () => {
      expect(supabaseClientUrl).toContain('localhost:8000');
    });

    it('should configure correct Auth service endpoint', () => {
      const authOptions = supabaseOptions.auth;
      expect(authOptions).toBeDefined();
      expect(authOptions.url).toBe('http://localhost:9999');
    });

    it('should configure correct Realtime service endpoint', () => {
      const realtimeOptions = supabaseOptions.realtime;
      expect(realtimeOptions).toBeDefined();
      expect(realtimeOptions.url).toBe('http://localhost:4000');
    });
  });
});

describe('Connection Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkSupabaseConnection', () => {
    it('should return connection status object', async () => {
      // Mock supabase auth getSession for testing
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ 
        data: { session: null }, 
        error: null 
      } as any);

      const result = await checkSupabaseConnection();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('connected');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.connected).toBe('boolean');
      expect(typeof result.timestamp).toBe('string');
    });

    it('should handle connection errors gracefully', async () => {
      // Mock supabase auth getSession to return an error
      const mockError = new Error('Connection failed');
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ 
        data: { session: null }, 
        error: mockError 
      } as any);

      const result = await checkSupabaseConnection();
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('connected');
      expect(result.connected).toBe(false);
    });
  });

  describe('testConnections', () => {
    it('should test all service connections and return status object', async () => {
      // Mock all service calls
      (global.fetch as any).mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null } as any);
      vi.spyOn(supabase.storage, 'listBuckets').mockResolvedValue({ data: [], error: null } as any);
      
      // Simplified realtime mock to avoid complex typing issues
      vi.spyOn(supabase, 'channel').mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
      } as any);
      vi.spyOn(supabase, 'removeChannel').mockReturnValue(undefined as any);

      const results = await testConnections();
      expect(results).toBeDefined();
      expect(typeof results).toBe('object');
      expect(results).toHaveProperty('postgrest');
      expect(results).toHaveProperty('auth');
      expect(results).toHaveProperty('storage');
      expect(results).toHaveProperty('realtime');
    });

    it('should return status for each service with proper structure', async () => {
      // Mock all service calls to return success
      (global.fetch as any).mockResolvedValue({ ok: true });
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null } as any);
      vi.spyOn(supabase.storage, 'listBuckets').mockResolvedValue({ data: [], error: null } as any);
      
      // Simplified realtime mock
      vi.spyOn(supabase, 'channel').mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
      } as any);
      vi.spyOn(supabase, 'removeChannel').mockReturnValue(undefined as any);

      const results = await testConnections();
      
      // Each service should have a status
      Object.values(results).forEach((serviceResult: any) => {
        expect(serviceResult).toHaveProperty('connected');
        expect(typeof serviceResult.connected).toBe('boolean');
      });
    });
  });
});