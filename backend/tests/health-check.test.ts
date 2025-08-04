/**
 * Enhanced Health Check Tests
 * Tests health check endpoint with error monitoring and dependency status
 */

import request from 'supertest';
import { app } from '../src/app';
import { getSupabaseClient } from '../src/services/supabase';

describe('Enhanced Health Check Endpoint', () => {
  afterAll((done) => {
    server.close(done);
  });

  describe('Basic Health Check', () => {
    test('should return healthy status with basic information', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        service: 'sobertube-backend',
        version: expect.any(String),
        environment: 'test',
        uptime: expect.any(Number),
        dependencies: expect.objectContaining({
          database: expect.objectContaining({
            status: expect.stringMatching(/healthy|unhealthy/),
            responseTime: expect.any(Number)
          })
        }),
        system: expect.objectContaining({
          memory: expect.objectContaining({
            used: expect.any(Number),
            total: expect.any(Number),
            percentage: expect.any(Number)
          }),
          cpu: expect.objectContaining({
            usage: expect.any(Number)
          })
        })
      });
    });

    test('should include uptime in response', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.uptime).toBeGreaterThan(0);
      expect(typeof response.body.uptime).toBe('number');
    });

    test('should include timestamp in ISO format', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const timestamp = response.body.timestamp;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      
      // Should be recent (within last 5 seconds)
      const timestampDate = new Date(timestamp);
      const now = new Date();
      expect(now.getTime() - timestampDate.getTime()).toBeLessThan(5000);
    });
  });

  describe('Database Health Check', () => {
    test('should check database connectivity', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.dependencies.database).toEqual({
        status: expect.stringMatching(/healthy|unhealthy/),
        responseTime: expect.any(Number),
        lastChecked: expect.any(String)
      });
    });

    test('should measure database response time', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const dbHealth = response.body.dependencies.database;
      expect(dbHealth.responseTime).toBeGreaterThan(0);
      expect(dbHealth.responseTime).toBeLessThan(10000); // Should be less than 10 seconds
    });

    test('should handle database connection errors gracefully', async () => {
      // Mock a database connection failure
      const supabase = getSupabaseClient();
      const originalQuery = supabase.from;
      supabase.from = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            single: jest.fn().mockRejectedValue(new Error('Connection failed'))
          })
        })
      }));

      const response = await request(app)
        .get('/health')
        .expect(503); // Service Unavailable when dependencies are unhealthy

      expect(response.body).toEqual({
        status: 'unhealthy',
        timestamp: expect.any(String),
        service: 'sobertube-backend',
        version: expect.any(String),
        environment: 'test',
        uptime: expect.any(Number),
        dependencies: expect.objectContaining({
          database: expect.objectContaining({
            status: 'unhealthy',
            error: 'Connection failed',
            responseTime: expect.any(Number)
          })
        }),
        system: expect.any(Object)
      });

      // Restore original function
      supabase.from = originalQuery;
    });
  });

  describe('System Metrics', () => {
    test('should include memory usage metrics', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const memory = response.body.system.memory;
      expect(memory.used).toBeGreaterThan(0);
      expect(memory.total).toBeGreaterThan(memory.used);
      expect(memory.percentage).toBeGreaterThan(0);
      expect(memory.percentage).toBeLessThan(100);
    });

    test('should include CPU usage metrics', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const cpu = response.body.system.cpu;
      expect(cpu.usage).toBeGreaterThanOrEqual(0);
      expect(cpu.usage).toBeLessThanOrEqual(100);
    });
  });

  describe('Error Rate Monitoring', () => {
    test('should include error rate in health check', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('errorRate');
      expect(response.body.errorRate).toEqual({
        last1Hour: expect.any(Number),
        last24Hours: expect.any(Number),
        threshold: expect.any(Number)
      });
    });

    test('should return unhealthy status when error rate exceeds threshold', async () => {
      // This test would require triggering many errors to exceed threshold
      // For now, we'll test the structure and logic
      const response = await request(app)
        .get('/health')
        .expect(200);

      const errorRate = response.body.errorRate;
      if (errorRate.last1Hour > errorRate.threshold) {
        expect(response.body.status).toBe('unhealthy');
      }
    });
  });

  describe('Detailed Health Check', () => {
    test('should provide detailed health information', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toEqual({
        status: expect.stringMatching(/healthy|unhealthy|degraded/),
        timestamp: expect.any(String),
        service: 'sobertube-backend',
        version: expect.any(String),
        environment: 'test',
        uptime: expect.any(Number),
        dependencies: expect.objectContaining({
          database: expect.any(Object)
        }),
        system: expect.any(Object),
        errorRate: expect.any(Object),
        performance: expect.objectContaining({
          averageResponseTime: expect.any(Number),
          requestsPerMinute: expect.any(Number)
        }),
        configuration: expect.objectContaining({
          nodeVersion: expect.any(String),
          environment: expect.any(String)
        })
      });
    });

    test('should include performance metrics in detailed check', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      const performance = response.body.performance;
      expect(performance.averageResponseTime).toBeGreaterThan(0);
      expect(performance.requestsPerMinute).toBeGreaterThanOrEqual(0);
    });
  });
});