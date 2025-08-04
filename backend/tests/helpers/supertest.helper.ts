/**
 * Supertest Helper Utilities
 * Enhanced HTTP testing capabilities for API endpoints
 */

import request from 'supertest';
import { Application } from 'express';

export interface TestRequestOptions {
  headers?: Record<string, string>;
  auth?: {
    token: string;
    type?: 'Bearer' | 'Basic';
  };
  timeout?: number;
}

export class SupertestHelper {
  private app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  /**
   * Enhanced GET request with common options
   */
  async get(path: string, options: TestRequestOptions = {}) {
    let req = request(this.app).get(path);

    if (options.headers) {
      req = req.set(options.headers);
    }

    if (options.auth) {
      const authType = options.auth.type || 'Bearer';
      req = req.set('Authorization', `${authType} ${options.auth.token}`);
    }

    if (options.timeout) {
      req = req.timeout(options.timeout);
    }

    return req;
  }

  /**
   * Enhanced POST request with common options
   */
  async post(path: string, data?: any, options: TestRequestOptions = {}) {
    let req = request(this.app).post(path);

    if (data) {
      req = req.send(data);
    }

    if (options.headers) {
      req = req.set(options.headers);
    }

    if (options.auth) {
      const authType = options.auth.type || 'Bearer';
      req = req.set('Authorization', `${authType} ${options.auth.token}`);
    }

    if (options.timeout) {
      req = req.timeout(options.timeout);
    }

    return req;
  }

  /**
   * Enhanced PUT request with common options
   */
  async put(path: string, data?: any, options: TestRequestOptions = {}) {
    let req = request(this.app).put(path);

    if (data) {
      req = req.send(data);
    }

    if (options.headers) {
      req = req.set(options.headers);
    }

    if (options.auth) {
      const authType = options.auth.type || 'Bearer';
      req = req.set('Authorization', `${authType} ${options.auth.token}`);
    }

    if (options.timeout) {
      req = req.timeout(options.timeout);
    }

    return req;
  }

  /**
   * Enhanced DELETE request with common options
   */
  async delete(path: string, options: TestRequestOptions = {}) {
    let req = request(this.app).delete(path);

    if (options.headers) {
      req = req.set(options.headers);
    }

    if (options.auth) {
      const authType = options.auth.type || 'Bearer';
      req = req.set('Authorization', `${authType} ${options.auth.token}`);
    }

    if (options.timeout) {
      req = req.timeout(options.timeout);
    }

    return req;
  }

  /**
   * Validate standard API response structure
   */
  validateApiResponse(response: any, expectedStatus: number = 200) {
    expect(response.status).toBe(expectedStatus);
    expect(response.headers['content-type']).toMatch(/json/);
    return response.body;
  }

  /**
   * Validate error response structure
   */
  validateErrorResponse(response: any, expectedStatus: number) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('error');
    return response.body;
  }

  /**
   * Test CORS headers
   */
  validateCorsHeaders(response: any) {
    expect(response.headers).toHaveProperty('access-control-allow-methods');
    return response.headers;
  }

  /**
   * Test security headers
   */
  validateSecurityHeaders(response: any) {
    expect(response.headers).toHaveProperty('x-content-type-options');
    expect(response.headers).toHaveProperty('x-frame-options');
    return response.headers;
  }
}

/**
 * Factory function to create SupertestHelper instance
 */
export function createSupertestHelper(app: Application): SupertestHelper {
  return new SupertestHelper(app);
}

/**
 * Common test data generators
 */
export const testData = {
  user: {
    valid: () => ({
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      password: 'TestPassword123!',
    }),
    
    invalid: () => ({
      email: 'invalid-email',
      name: '',
      password: '123',
    }),
  },

  video: {
    valid: () => ({
      title: 'Test Video',
      description: 'Test video description',
      tags: ['recovery', 'inspiration'],
    }),
    
    invalid: () => ({
      title: '',
      description: 'x'.repeat(2001), // Too long
      tags: [],
    }),
  },

  auth: {
    validToken: 'test-jwt-token-here',
    invalidToken: 'invalid-token',
    expiredToken: 'expired-token',
  },
};