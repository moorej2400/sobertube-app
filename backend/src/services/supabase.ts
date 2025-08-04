/**
 * Supabase Service Module
 * Handles Supabase client initialization, connection management, and database operations
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import {
  DatabaseConnectionStatus,
  DatabaseHealthCheck,
  SupabaseClientConfig,
  DatabaseTransaction,
  DatabaseOperationResult
} from '../types/supabase';

// Singleton client instance
let supabaseClient: SupabaseClient<any, 'public'> | null = null;

/**
 * Create Supabase client with configuration
 */
export function createSupabaseClient(customConfig?: SupabaseClientConfig): SupabaseClient<any, 'public'> {
  const clientConfig = customConfig || {
    url: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    options: {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  };

  // Validate configuration
  if (!clientConfig.url || !clientConfig.anonKey) {
    throw new Error('Supabase URL and anonymous key are required');
  }

  if (!clientConfig.url.startsWith('http')) {
    throw new Error('Supabase URL must be a valid HTTP/HTTPS URL');
  }

  return createClient(clientConfig.url, clientConfig.anonKey, clientConfig.options) as SupabaseClient<any, 'public'>;
}/**
 * Get singleton Supabase client instance
 */
export function getSupabaseClient(): SupabaseClient<any, 'public'> {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient();
  }
  return supabaseClient;
}

/**
 * Validate connection to Supabase instance
 */
export async function validateSupabaseConnection(
  customConfig?: SupabaseClientConfig
): Promise<DatabaseConnectionStatus> {
  const startTime = Date.now();
  
  try {
    const client = customConfig ? createSupabaseClient(customConfig) : getSupabaseClient();
    
    // Test connection by getting session (lightweight operation)
    const { error } = await client.auth.getSession();
    
    const endTime = Date.now();
    const latency = endTime - startTime;

    if (error && error.message.includes('connect') || error?.message.includes('network')) {
      return {
        isConnected: false,
        lastChecked: new Date(),
        error: error.message
      };
    }

    return {
      isConnected: true,
      lastChecked: new Date(),
      latency
    };
  } catch (error) {
    return {
      isConnected: false,
      lastChecked: new Date(),
      error: error instanceof Error ? error.message : 'Unknown connection error'
    };
  }
}/**
 * Get comprehensive database health status
 */
export async function getConnectionHealth(): Promise<DatabaseHealthCheck> {
  const connectionStatus = await validateSupabaseConnection();
  const timestamp = new Date();

  let status: 'healthy' | 'unhealthy' | 'degraded';
  
  if (!connectionStatus.isConnected) {
    status = 'unhealthy';
  } else if (connectionStatus.latency && connectionStatus.latency > 1000) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  const healthCheck: DatabaseHealthCheck = {
    status,
    connectionStatus,
    timestamp
  };

  // Add connection details if available
  if (connectionStatus.isConnected) {
    healthCheck.details = {
      poolSize: 1, // Supabase handles pool internally
      activeConnections: 1,
      pendingConnections: 0
    };
  }

  return healthCheck;
}/**
 * Begin new database transaction
 */
export async function beginTransaction(): Promise<DatabaseTransaction> {
  const client = getSupabaseClient();
  const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    id: transactionId,
    startTime: new Date(),
    isActive: true,
    client
  };
}

/**
 * Commit database transaction
 */
export async function commitTransaction(transaction: DatabaseTransaction): Promise<DatabaseOperationResult> {
  try {
    // Supabase doesn't expose traditional transactions at the client level
    // This is a simulation for the interface - in practice, Supabase handles transactions internally
    transaction.isActive = false;
    
    return {
      success: true,
      executionTime: Date.now() - transaction.startTime.getTime()
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transaction commit failed',
      executionTime: Date.now() - transaction.startTime.getTime()
    };
  }
}

/**
 * Rollback database transaction
 */
export async function rollbackTransaction(transaction: DatabaseTransaction): Promise<DatabaseOperationResult> {
  try {
    // Simulate rollback
    transaction.isActive = false;
    
    return {
      success: true,
      executionTime: Date.now() - transaction.startTime.getTime()
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transaction rollback failed',
      executionTime: Date.now() - transaction.startTime.getTime()
    };
  }
}/**
 * Execute operation within transaction context
 */
export async function executeInTransaction<T>(
  operation: (client: SupabaseClient<any, 'public'>) => Promise<T>
): Promise<DatabaseOperationResult<T>> {
  const transaction = await beginTransaction();
  const startTime = Date.now();
  
  try {
    const result = await operation(transaction.client);
    await commitTransaction(transaction);
    
    return {
      success: true,
      data: result,
      executionTime: Date.now() - startTime
    };
  } catch (error) {
    await rollbackTransaction(transaction);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transaction operation failed',
      executionTime: Date.now() - startTime
    };
  }
}/**
 * Check database health (alias for getConnectionHealth)
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthCheck> {
  return getConnectionHealth();
}

/**
 * Test database operation
 */
export async function testDatabaseOperation(): Promise<DatabaseOperationResult> {
  const startTime = Date.now();
  
  try {
    const client = getSupabaseClient();
    const { error } = await client.auth.getSession();
    
    return {
      success: !error,
      error: error ? error.message : undefined,
      executionTime: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Database operation failed',
      executionTime: Date.now() - startTime
    };
  }
}