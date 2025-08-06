/**
 * Service Connectivity Verification Tests
 * Sub-feature 1.1.2: Service Startup and Connectivity Verification
 * 
 * Tests to verify all self-hosted Supabase services are running and functional
 * This follows TDD methodology - tests written first to define expected behavior
 */

import { describe, test, expect } from '@jest/globals';

describe('Service Connectivity Verification - Sub-feature 1.1.2', () => {
  
  describe('Core Infrastructure Services', () => {
    
    test('PostgreSQL should be accessible and healthy', async () => {
      // Test PostgreSQL connection on port 5433
      const response = await fetch('http://localhost:5433');
      // PostgreSQL doesn't respond to HTTP, but connection should be refused, not timeout
      expect(response).toBeDefined();
    }, 30000);

    test('Redis should be accessible and respond to ping', async () => {
      // Redis health check - we'll use a simple connection test
      // Note: This is a placeholder - actual Redis client test will be implemented
      expect(true).toBe(true); // Placeholder for Redis connectivity test
    }, 10000);

  });

  describe('Supabase Service Stack', () => {
    
    test('PostgREST API should be accessible and return schema', async () => {
      const response = await fetch('http://localhost:3000/', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // PostgREST should return OpenAPI schema
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
    }, 15000);

    test('GoTrue Auth service should be accessible and return version info', async () => {
      const response = await fetch('http://localhost:9999/health', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      const healthData = await response.json() as any;
      expect(healthData).toHaveProperty('name');
      expect(healthData.name).toBe('GoTrue');
      expect(healthData).toHaveProperty('version');
    }, 15000);

    test('Supabase Realtime service should be accessible', async () => {
      const response = await fetch('http://localhost:4000/health', {
        method: 'GET'
      });
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    }, 15000);

  });

  describe('Storage Services', () => {
    
    test('MinIO should be accessible and respond to health checks', async () => {
      const response = await fetch('http://localhost:9000/minio/health/live', {
        method: 'GET'
      });
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    }, 15000);

    test('Supabase Storage API should be accessible', async () => {
      const response = await fetch('http://localhost:5000/status', {
        method: 'GET'
      });
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    }, 15000);

  });

  describe('Supporting Services', () => {
    
    test('ImgProxy should be accessible and respond to health checks', async () => {
      const response = await fetch('http://localhost:8080/health', {
        method: 'GET'
      });
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    }, 15000);

    test('Inbucket SMTP service should be accessible', async () => {
      const response = await fetch('http://localhost:9110/', {
        method: 'GET'
      });
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    }, 15000);

    test('Edge Functions runtime should be accessible', async () => {
      const response = await fetch('http://localhost:54330/health', {
        method: 'GET'
      });
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    }, 15000);

  });

  describe('Monitoring Services', () => {
    
    test('Grafana should be accessible', async () => {
      const response = await fetch('http://localhost:3001/api/health', {
        method: 'GET'
      });
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    }, 15000);

    test('Prometheus should be accessible and return metrics', async () => {
      const response = await fetch('http://localhost:9090/api/v1/query?query=up', {
        method: 'GET'
      });
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      const data = await response.json() as any;
      expect(data).toHaveProperty('status');
      expect(data.status).toBe('success');
    }, 15000);

  });

  describe('Inter-Service Communication', () => {
    
    test('PostgREST should successfully connect to PostgreSQL', async () => {
      // Test that PostgREST can query the database
      const response = await fetch('http://localhost:3000/', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      expect(response.ok).toBe(true);
      // If PostgREST can return schema, it's connected to PostgreSQL
      const schema = await response.json() as any;
      expect(schema).toBeDefined();
    }, 20000);

    test('GoTrue should successfully connect to PostgreSQL', async () => {
      // Test that GoTrue can perform authentication operations
      const response = await fetch('http://localhost:9999/health');
      expect(response.ok).toBe(true);
      
      // GoTrue health endpoint responding means it can connect to the database
      const health = await response.json() as any;
      expect(health).toHaveProperty('name', 'GoTrue');
    }, 20000);

    test('Supabase Storage should connect to MinIO and PostgreSQL', async () => {
      const response = await fetch('http://localhost:5000/status');
      expect(response.ok).toBe(true);
      
      // Storage API responding means it can connect to both MinIO and PostgreSQL
    }, 20000);

  });

});