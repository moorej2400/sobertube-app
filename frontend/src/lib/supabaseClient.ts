/**
 * Supabase Client Configuration for Local Self-Hosted Services
 * Configures frontend to connect to local Docker-composed Supabase stack
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables for Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:8000';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Direct service endpoints for advanced configuration
const postgrestUrl = import.meta.env.VITE_POSTGREST_URL || 'http://localhost:3000';
const gotrueUrl = import.meta.env.VITE_GOTRUE_URL || 'http://localhost:9999';
const realtimeUrl = import.meta.env.VITE_REALTIME_URL || 'ws://localhost:4000';
const storageUrl = import.meta.env.VITE_STORAGE_URL || 'http://localhost:5000';

// Supabase client configuration for local development
const supabaseOptions = {
  auth: {
    // Configure auth service endpoint
    url: gotrueUrl,
    // Auto-refresh tokens
    autoRefreshToken: true,
    // Persist auth state in localStorage
    persistSession: true,
    // Detect session changes
    detectSessionInUrl: true,
  },
  realtime: {
    // Configure realtime WebSocket endpoint
    url: realtimeUrl.replace('ws://', 'http://').replace('wss://', 'https://'),
    // Connection options
    heartbeatIntervalMs: 30000,
    reconnectDelayMs: 1000,
    maxReconnectAttempts: 10,
  },
  global: {
    // Global headers for API requests
    headers: {
      'x-client-info': 'sobertube-frontend@1.0.0',
    },
  },
  db: {
    schema: 'public',
  },
  // Development settings
  debug: import.meta.env.VITE_DEBUG_MODE === 'true',
};

// Create Supabase client instance
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  supabaseOptions
);

// Export configuration for testing
export { supabaseUrl as supabaseClientUrl, supabaseAnonKey as supabaseClientKey, supabaseOptions };

/**
 * Test connection to Supabase main endpoint
 */
export async function checkSupabaseConnection(): Promise<{
  connected: boolean;
  error?: string;
  timestamp: string;
}> {
  try {
    // Simple health check using auth service
    const { error } = await supabase.auth.getSession();
    
    return {
      connected: !error,
      error: error?.message,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : 'Unknown connection error',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Test connections to all Supabase services
 */
export async function testConnections(): Promise<{
  postgrest: { connected: boolean; error?: string };
  auth: { connected: boolean; error?: string };
  storage: { connected: boolean; error?: string };
  realtime: { connected: boolean; error?: string };
}> {
  const results = {
    postgrest: { connected: false, error: undefined as string | undefined },
    auth: { connected: false, error: undefined as string | undefined },
    storage: { connected: false, error: undefined as string | undefined },
    realtime: { connected: false, error: undefined as string | undefined },
  };

  // Test PostgREST connection
  try {
    const response = await fetch(`${postgrestUrl}/`, { method: 'HEAD' });
    results.postgrest.connected = response.ok;
    if (!response.ok) {
      results.postgrest.error = `HTTP ${response.status}: ${response.statusText}`;
    }
  } catch (err) {
    results.postgrest.error = err instanceof Error ? err.message : 'PostgREST connection failed';
  }

  // Test Auth (GoTrue) connection
  try {
    const { error } = await supabase.auth.getSession();
    results.auth.connected = !error;
    if (error) {
      results.auth.error = error.message;
    }
  } catch (err) {
    results.auth.error = err instanceof Error ? err.message : 'Auth service connection failed';
  }

  // Test Storage connection
  try {
    const { error } = await supabase.storage.listBuckets();
    results.storage.connected = !error;
    if (error) {
      results.storage.error = error.message;
    }
  } catch (err) {
    results.storage.error = err instanceof Error ? err.message : 'Storage service connection failed';
  }

  // Test Realtime connection
  try {
    // Simple connection test without actually subscribing
    const channel = supabase.channel('connection-test');
    results.realtime.connected = !!channel;
    
    // Clean up the test channel immediately
    supabase.removeChannel(channel);
  } catch (err) {
    results.realtime.error = err instanceof Error ? err.message : 'Realtime service connection failed';
  }

  return results;
}

/**
 * Helper function to get current Supabase configuration
 */
export function getSupabaseConfig() {
  return {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    endpoints: {
      postgrest: postgrestUrl,
      auth: gotrueUrl,
      realtime: realtimeUrl,
      storage: storageUrl,
    },
    options: supabaseOptions,
  };
}