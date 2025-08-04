/**
 * Supabase Database Connection Tests
 * Tests for database connection management and health checks
 */

import { 
  DatabaseConnectionStatus, 
  DatabaseHealthCheck
} from '../../src/types/supabase';

// Import functions for connection testing
import { 
  validateSupabaseConnection,
  getConnectionHealth
} from '../../src/services/supabase';

describe('Supabase Database Connection Management', () => {
  describe('Connection Validation', () => {
    test('should validate connection to Supabase instance', async () => {
      const connectionStatus: DatabaseConnectionStatus = await validateSupabaseConnection();
      
      expect(connectionStatus).toBeDefined();
      expect(connectionStatus.isConnected).toBe(true);
      expect(connectionStatus.lastChecked).toBeInstanceOf(Date);
      expect(typeof connectionStatus.latency).toBe('number');
      expect(connectionStatus.latency).toBeGreaterThanOrEqual(0);
    });

    test('should handle connection failure gracefully', async () => {
      // Test with invalid configuration
      const invalidConfig = {
        url: 'http://invalid-url:99999',
        anonKey: 'invalid-key'
      };
      
      const connectionStatus = await validateSupabaseConnection(invalidConfig);
      
      expect(connectionStatus.isConnected).toBe(false);
      expect(connectionStatus.error).toBeDefined();
      expect(typeof connectionStatus.error).toBe('string');
    });

    test('should measure connection latency accurately', async () => {
      const startTime = Date.now();
      const connectionStatus = await validateSupabaseConnection();
      const endTime = Date.now();
      
      expect(connectionStatus.latency).toBeLessThanOrEqual(endTime - startTime);
      expect(connectionStatus.latency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Health Checks', () => {
    test('should perform comprehensive health check', async () => {
      const healthCheck: DatabaseHealthCheck = await getConnectionHealth();
      
      expect(healthCheck).toBeDefined();
      expect(['healthy', 'unhealthy', 'degraded']).toContain(healthCheck.status);
      expect(healthCheck.connectionStatus).toBeDefined();
      expect(healthCheck.timestamp).toBeInstanceOf(Date);
    });

    test('should return healthy status for working connection', async () => {
      const healthCheck = await getConnectionHealth();
      
      expect(healthCheck.status).toBe('healthy');
      expect(healthCheck.connectionStatus.isConnected).toBe(true);
    });

    test('should include connection details in health check', async () => {
      const healthCheck = await getConnectionHealth();
      
      if (healthCheck.details) {
        expect(typeof healthCheck.details.poolSize).toBe('number');
        expect(typeof healthCheck.details.activeConnections).toBe('number');
      }
    });
  });
});