/**
 * Environment Configuration Tests for SoberTube
 * Phase 1.2: Shared Environment Configuration Tests
 * 
 * These tests verify that:
 * - Environment variable validation works correctly
 * - Configuration loading handles all environments (dev/test/prod)
 * - Type validation and default values work properly
 * - Error handling provides clear messages for missing/invalid variables
 */

const path = require('path');
const fs = require('fs');

// We'll import our config utilities once they're implemented
let EnvironmentConfig;
let validateEnvironment;
let loadConfig;

beforeAll(() => {
  // This will fail initially until we implement the modules
  try {
    const configModule = require('../src/shared/config/environment');
    EnvironmentConfig = configModule.EnvironmentConfig;
    validateEnvironment = configModule.validateEnvironment;
    loadConfig = configModule.loadConfig;
  } catch (error) {
    // Expected to fail initially in TDD - tests define the API
    console.log('Environment config module not yet implemented');
  }
});

describe('Phase 1.2: Environment Configuration System', () => {

  describe('Environment Variable Validation', () => {

    test('should validate required string variables', () => {
      expect(() => {
        validateEnvironment({
          NODE_ENV: { type: 'string', required: true }
        }, { NODE_ENV: 'development' });
      }).not.toThrow();

      expect(() => {
        validateEnvironment({
          NODE_ENV: { type: 'string', required: true }
        }, {});
      }).toThrow('Missing required environment variable: NODE_ENV');
    });

    test('should validate number variables with type conversion', () => {
      expect(() => {
        validateEnvironment({
          PORT: { type: 'number', required: true }
        }, { PORT: '8080' });
      }).not.toThrow();

      expect(() => {
        validateEnvironment({
          PORT: { type: 'number', required: true }
        }, { PORT: 'invalid' });
      }).toThrow('Invalid number value for PORT: invalid');
    });

    test('should validate boolean variables with type conversion', () => {
      expect(() => {
        validateEnvironment({
          DEBUG: { type: 'boolean', required: false, default: false }
        }, { DEBUG: 'true' });
      }).not.toThrow();

      expect(() => {
        validateEnvironment({
          DEBUG: { type: 'boolean', required: false, default: false }
        }, { DEBUG: 'yes' });
      }).not.toThrow();

      expect(() => {
        validateEnvironment({
          DEBUG: { type: 'boolean', required: false, default: false }
        }, { DEBUG: 'invalid' });
      }).toThrow('Invalid boolean value for DEBUG: invalid');
    });

    test('should validate URL variables with proper format', () => {
      expect(() => {
        validateEnvironment({
          API_URL: { type: 'url', required: true }
        }, { API_URL: 'http://localhost:8080' });
      }).not.toThrow();

      expect(() => {
        validateEnvironment({
          API_URL: { type: 'url', required: true }
        }, { API_URL: 'not-a-url' });
      }).toThrow('Invalid URL format for API_URL: not-a-url');
    });

  });

  describe('Default Value Handling', () => {

    test('should apply default values for missing optional variables', () => {
      const result = validateEnvironment({
        PORT: { type: 'number', required: false, default: 3000 },
        DEBUG: { type: 'boolean', required: false, default: false }
      }, {});

      expect(result.PORT).toBe(3000);
      expect(result.DEBUG).toBe(false);
    });

    test('should not override provided values with defaults', () => {
      const result = validateEnvironment({
        PORT: { type: 'number', required: false, default: 3000 }
      }, { PORT: '8080' });

      expect(result.PORT).toBe(8080);
    });

  });

  describe('Configuration Loading', () => {

    test('should load development environment configuration', () => {
      const config = loadConfig('development');
      
      expect(config).toHaveProperty('NODE_ENV', 'development');
      expect(config).toHaveProperty('SUPABASE_URL');
      expect(config).toHaveProperty('DATABASE_URL');
      expect(config).toHaveProperty('PORT');
      
      // Development specific defaults
      expect(config.PORT).toBe(8080);
    });

    test('should load test environment configuration', () => {
      const config = loadConfig('test');
      
      expect(config).toHaveProperty('NODE_ENV', 'test');
      expect(config).toHaveProperty('SUPABASE_URL');
      expect(config).toHaveProperty('DATABASE_URL');
    });

    test('should load production environment configuration template', () => {
      // In production, we should have all required vars defined but no defaults for secrets
      const config = loadConfig('production');
      
      expect(config).toHaveProperty('NODE_ENV', 'production');
      // Should require explicit setting of sensitive values
      expect(config.JWT_SECRET).not.toBe('your-super-secret-jwt-key-change-in-production');
    });

  });

  describe('Error Reporting', () => {

    test('should provide clear error messages for missing required variables', () => {
      expect(() => {
        validateEnvironment({
          DATABASE_URL: { type: 'string', required: true },
          JWT_SECRET: { type: 'string', required: true }
        }, { DATABASE_URL: 'postgres://...' });
      }).toThrow('Missing required environment variable: JWT_SECRET');
    });

    test('should provide helpful error for invalid types', () => {
      expect(() => {
        validateEnvironment({
          MAX_FILE_SIZE: { type: 'number', required: true }
        }, { MAX_FILE_SIZE: 'large' });
      }).toThrow('Invalid number value for MAX_FILE_SIZE: large');
    });

    test('should collect and report multiple validation errors', () => {
      expect(() => {
        validateEnvironment({
          DATABASE_URL: { type: 'string', required: true },
          PORT: { type: 'number', required: true },
          API_URL: { type: 'url', required: true }
        }, { PORT: 'invalid', API_URL: 'not-url' });
      }).toThrow(/Multiple environment variable errors/);
    });

  });

  describe('Environment Configuration Class', () => {

    test('should create instance with valid configuration', () => {
      const envVars = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
        SUPABASE_URL: 'http://localhost:54321',
        SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
        JWT_SECRET: 'test-jwt-secret',
        SESSION_SECRET: 'test-session-secret',
        PORT: '3000'
      };

      expect(() => {
        new EnvironmentConfig(envVars);
      }).not.toThrow();
    });

    test('should provide typed access to configuration values', () => {
      const envVars = {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
        SUPABASE_URL: 'http://localhost:54321',
        SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
        JWT_SECRET: 'dev-jwt-secret',
        SESSION_SECRET: 'dev-session-secret',
        PORT: '8080',
        DEBUG: 'true'
      };

      const config = new EnvironmentConfig(envVars);
      
      expect(config.get('NODE_ENV')).toBe('development');
      expect(config.get('PORT')).toBe(8080); // Should be converted to number
      expect(config.get('DEBUG')).toBe(true); // Should be converted to boolean
    });

    test('should provide environment-specific methods', () => {
      const baseEnvVars = {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
        SUPABASE_URL: 'http://localhost:54321',
        SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
        JWT_SECRET: 'test-jwt-secret',
        SESSION_SECRET: 'test-session-secret'
      };

      const devConfig = new EnvironmentConfig({ ...baseEnvVars, NODE_ENV: 'development' });
      const prodConfig = new EnvironmentConfig({ ...baseEnvVars, NODE_ENV: 'production' });
      const testConfig = new EnvironmentConfig({ ...baseEnvVars, NODE_ENV: 'test' });

      expect(devConfig.isDevelopment()).toBe(true);
      expect(devConfig.isProduction()).toBe(false);
      expect(devConfig.isTest()).toBe(false);

      expect(prodConfig.isDevelopment()).toBe(false);
      expect(prodConfig.isProduction()).toBe(true);
      expect(prodConfig.isTest()).toBe(false);

      expect(testConfig.isDevelopment()).toBe(false);
      expect(testConfig.isProduction()).toBe(false);
      expect(testConfig.isTest()).toBe(true);
    });

  });

});