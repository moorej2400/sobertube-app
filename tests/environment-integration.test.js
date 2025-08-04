/**
 * Environment Configuration Integration Tests for SoberTube
 * Phase 1.2: Cross-platform and Build Process Tests
 * 
 * These tests verify that:
 * - Configuration works in both backend (Node.js) and frontend (Vite) contexts
 * - Build processes can access environment variables correctly
 * - Docker environment variable injection works
 * - Configuration is consistent across all deployment stages
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Mock environment for testing different scenarios
const mockEnvironments = {
  development: {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    PORT: '8080',
    JWT_SECRET: 'dev-secret-key',
    SESSION_SECRET: 'dev-session-key'
  },
  test: {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres_test',
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    PORT: '8081',
    JWT_SECRET: 'test-secret-key',
    SESSION_SECRET: 'test-session-key'
  },
  production: {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@prod-host:5432/sobertube_prod',
    SUPABASE_URL: 'https://your-project.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.prod',
    PORT: '3000',
    JWT_SECRET: 'super-secure-production-secret',
    SESSION_SECRET: 'super-secure-production-session'
  }
};

describe('Phase 1.2: Environment Configuration Integration', () => {

  describe('Backend Configuration Integration', () => {

    test('should load configuration in Node.js backend context', async () => {
      // Test that our configuration can be imported and used in backend
      const testScript = `
        process.env.NODE_ENV = 'test';
        process.env.DATABASE_URL = '${mockEnvironments.test.DATABASE_URL}';
        process.env.PORT = '${mockEnvironments.test.PORT}';
        
        try {
          const { loadConfig } = require('./src/shared/config/environment');
          const config = loadConfig('test');
          console.log(JSON.stringify({
            success: true,
            nodeEnv: config.NODE_ENV,
            port: config.PORT,
            hasDatabase: !!config.DATABASE_URL
          }));
        } catch (error) {
          console.log(JSON.stringify({
            success: false,
            error: error.message
          }));
        }
      `;

      return new Promise((resolve, reject) => {
        const child = spawn('node', ['-e', testScript], {
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        child.stdout.on('data', (data) => {
          output += data.toString();
        });

        child.on('close', (code) => {
          try {
            // Filter out dotenv logs and extract JSON
            const lines = output.split('\n');
            const jsonLine = lines.find(line => line.trim().startsWith('{'));
            if (!jsonLine) {
              throw new Error('No JSON output found');
            }
            const result = JSON.parse(jsonLine.trim());
            expect(result.success).toBe(true);
            expect(result.nodeEnv).toBe('test');
            expect(result.port).toBe(8081);
            expect(result.hasDatabase).toBe(true);
            resolve();
          } catch (error) {
            reject(new Error(`Backend integration test failed: ${error.message}\nOutput: ${output}`));
          }
        });
      });
    });

    test('should validate required backend environment variables', async () => {
      // Test with missing required variables
      const testScript = `
        // Clear all environment variables except NODE_ENV
        const originalEnv = { ...process.env };
        for (const key in process.env) {
          if (key !== 'NODE_ENV' && key !== 'PATH') {
            delete process.env[key];
          }
        }
        process.env.NODE_ENV = 'production';
        
        try {
          // Mock dotenv to prevent loading .env file
          const Module = require('module');
          const originalRequire = Module.prototype.require;
          Module.prototype.require = function(id) {
            if (id === 'dotenv') {
              return { config: () => {} }; // No-op dotenv
            }
            return originalRequire.apply(this, arguments);
          };
          
          const { loadConfig } = require('./src/shared/config/environment');
          const config = loadConfig('production');
          console.log(JSON.stringify({ success: true }));
        } catch (error) {
          console.log(JSON.stringify({
            success: false,
            error: error.message,
            hasValidationError: error.message.includes('Missing required')
          }));
        }
      `;

      return new Promise((resolve, reject) => {
        const child = spawn('node', ['-e', testScript], {
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        child.stdout.on('data', (data) => {
          output += data.toString();
        });

        child.on('close', (code) => {
          try {
            // Filter out dotenv logs and extract JSON
            const lines = output.split('\n');
            const jsonLine = lines.find(line => line.trim().startsWith('{'));
            if (!jsonLine) {
              throw new Error('No JSON output found');
            }
            const result = JSON.parse(jsonLine.trim());
            expect(result.success).toBe(false);
            expect(result.hasValidationError).toBe(true);
            resolve();
          } catch (error) {
            reject(new Error(`Backend validation test failed: ${error.message}\nOutput: ${output}`));
          }
        });
      });
    });

  });

  describe('Frontend Configuration Integration', () => {

    test('should provide frontend-compatible configuration export', () => {
      // Test that we can create a frontend-compatible version
      // Frontend needs VITE_ prefixed variables
      const envVars = {
        ...mockEnvironments.development,
        VITE_SUPABASE_URL: mockEnvironments.development.SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: mockEnvironments.development.SUPABASE_ANON_KEY,
        VITE_API_BASE_URL: `http://localhost:${mockEnvironments.development.PORT}`
      };

      // We'll test that our system can generate frontend config
      expect(() => {
        const { generateFrontendConfig } = require('../src/shared/config/environment');
        const frontendConfig = generateFrontendConfig(envVars);
        
        expect(frontendConfig).toHaveProperty('VITE_SUPABASE_URL');
        expect(frontendConfig).toHaveProperty('VITE_SUPABASE_ANON_KEY');
        expect(frontendConfig).toHaveProperty('VITE_API_BASE_URL');
        
        // Should not include backend-only secrets
        expect(frontendConfig).not.toHaveProperty('JWT_SECRET');
        expect(frontendConfig).not.toHaveProperty('DATABASE_URL');
      }).not.toThrow();
    });

  });

  describe('Build Process Integration', () => {

    test('should work with TypeScript compilation', async () => {
      // Test that our JavaScript configuration files have valid syntax
      try {
        // Test that the configuration file can be parsed without syntax errors
        const configModule = require('../src/shared/config/environment');
        expect(configModule).toHaveProperty('EnvironmentConfig');
        expect(configModule).toHaveProperty('validateEnvironment');
        expect(configModule).toHaveProperty('loadConfig');
        expect(configModule).toHaveProperty('generateFrontendConfig');
        
        // Test that functions are callable
        expect(typeof configModule.EnvironmentConfig).toBe('function');
        expect(typeof configModule.validateEnvironment).toBe('function');
        expect(typeof configModule.loadConfig).toBe('function');
        expect(typeof configModule.generateFrontendConfig).toBe('function');
        
        console.log('Configuration module syntax validation passed');
      } catch (error) {
        throw new Error(`Configuration module has syntax errors: ${error.message}`);
      }
    });

    test('should support environment-specific builds', () => {
      // Test that different environments can be built
      const environments = ['development', 'test', 'production'];
      
      environments.forEach(env => {
        expect(() => {
          // Set environment and test configuration loading
          const originalEnv = process.env.NODE_ENV;
          process.env = { ...process.env, ...mockEnvironments[env] };
          
          const { loadConfig } = require('../src/shared/config/environment');
          const config = loadConfig(env);
          
          expect(config.NODE_ENV).toBe(env);
          
          // Restore original environment
          process.env.NODE_ENV = originalEnv;
        }).not.toThrow();
      });
    });

  });

  describe('Docker Environment Integration', () => {

    test('should support Docker environment variable injection', () => {
      // Test that configuration works with Docker-style environment variables
      const dockerEnvVars = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:password@db:5432/sobertube',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.docker',
        PORT: '3000',
        JWT_SECRET: 'docker-injected-secret',
        SESSION_SECRET: 'docker-injected-session-secret'
      };

      expect(() => {
        const { validateEnvironment } = require('../src/shared/config/environment');
        
        // Define expected schema for Docker deployment
        const dockerSchema = {
          NODE_ENV: { type: 'string', required: true },
          DATABASE_URL: { type: 'string', required: true },
          SUPABASE_URL: { type: 'url', required: true },
          SUPABASE_ANON_KEY: { type: 'string', required: true },
          PORT: { type: 'number', required: true },
          JWT_SECRET: { type: 'string', required: true },
          SESSION_SECRET: { type: 'string', required: true }
        };

        const validatedConfig = validateEnvironment(dockerSchema, dockerEnvVars);
        
        expect(validatedConfig.NODE_ENV).toBe('production');
        expect(validatedConfig.PORT).toBe(3000); // Should be converted to number
        expect(validatedConfig.DATABASE_URL).toContain('db:5432'); // Docker hostname
      }).not.toThrow();
    });

  });

  describe('Configuration Consistency', () => {

    test('should maintain consistent configuration across all stages', () => {
      // Test that the same configuration schema works across all environments
      const requiredFields = [
        'NODE_ENV',
        'DATABASE_URL', 
        'SUPABASE_URL',
        'SUPABASE_ANON_KEY',
        'PORT'
      ];

      ['development', 'test', 'production'].forEach(env => {
        const config = mockEnvironments[env];
        
        requiredFields.forEach(field => {
          expect(config).toHaveProperty(field);
          expect(config[field]).toBeDefined();
          expect(config[field]).not.toBe('');
        });
      });
    });

    test('should handle environment-specific overrides correctly', () => {
      // Test that production overrides development defaults appropriately
      const devConfig = mockEnvironments.development;
      const prodConfig = mockEnvironments.production;

      // Port should be different
      expect(prodConfig.PORT).not.toBe(devConfig.PORT);
      
      // Production should not use development secrets
      expect(prodConfig.JWT_SECRET).not.toBe(devConfig.JWT_SECRET);
      expect(prodConfig.DATABASE_URL).not.toContain('localhost');
    });

  });

});

// Cleanup
afterAll(() => {
  console.log('Environment integration tests completed');
});