/**
 * Supabase TypeScript Interfaces
 * Type definitions for Supabase client operations and database entities
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Database connection status
 */
export interface DatabaseConnectionStatus {
  isConnected: boolean;
  lastChecked: Date;
  latency?: number;
  error?: string;
}

/**
 * Database health check result
 */
export interface DatabaseHealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  connectionStatus: DatabaseConnectionStatus;
  timestamp: Date;
  details?: {
    poolSize?: number;
    activeConnections?: number;
    pendingConnections?: number;
  };
}

/**
 * Supabase client configuration options
 */
export interface SupabaseClientConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
  options?: {
    auth?: {
      persistSession?: boolean;
      autoRefreshToken?: boolean;
    };
    db?: {
      schema?: string;
    };
    global?: {
      headers?: Record<string, string>;
    };
  };
}

/**
 * Database transaction context
 */
export interface DatabaseTransaction {
  id: string;
  startTime: Date;
  isActive: boolean;
  client: SupabaseClient<any, 'public'>;
}

/**
 * Database operation result
 */
export interface DatabaseOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string | undefined;
  executionTime: number;
}

/**
 * Connection pool statistics
 */
export interface ConnectionPoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingConnections: number;
  maxConnections: number;
}