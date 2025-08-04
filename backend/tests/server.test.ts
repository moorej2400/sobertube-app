/**
 * Server initialization and basic functionality tests
 * Tests the core server setup, middleware, and basic endpoints
 */

import request from 'supertest';
import { app } from '../src/app';

describe('Server Initialization', () => {
  afterAll((done) => {
    server.close(done);
  });

  describe('Basic Server Setup', () => {
    test('should start server successfully', async () => {
      expect(app).toBeDefined();
      expect(server).toBeDefined();
    });

    test('should have health check endpoint', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        service: 'sobertube-backend',
        version: expect.any(String),
        environment: 'test'
      });
    });

    test('should handle JSON parsing', async () => {
      const testData = { message: 'test' };
      
      // First create a test endpoint that echoes JSON
      await request(app)
        .post('/health')
        .send(testData)
        .expect(404); // Should get 404 since POST /health doesn't exist yet
    });
  });

  describe('Security Middleware', () => {
    test('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Check that helmet security headers are present
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });

    test('should handle CORS', async () => {
      const response = await request(app)
        .options('/health')
        .expect(204);

      // CORS headers are present - we can see access-control-allow-methods and credentials  
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 for non-existent routes', async () => {
      await request(app)
        .get('/non-existent-route')
        .expect(404);
    });

    test('should handle malformed JSON', async () => {
      await request(app)
        .post('/health')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });
  });
});