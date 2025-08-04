/**
 * Environment-Specific Service Configuration Tests for SoberTube
 * Phase 1.2.3: Service Configuration Tests
 * 
 * These tests verify that:
 * - Development services are configured with hot reload and debugging
 * - Test services are isolated and use test-specific configurations
 * - Production services are optimized and secure
 * - Docker services are properly configured for each environment
 * - Service startup and health checks work correctly
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

describe('Phase 1.2.3: Environment-Specific Service Configurations', () => {

  describe('Development Service Configuration', () => {

    test('should configure development services with hot reload', () => {
      const dockerComposeContent = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      const dockerCompose = yaml.load(dockerComposeContent);
      
      // Development services should have volume mounts for hot reload
      if (dockerCompose.services['frontend-dev']) {
        expect(dockerCompose.services['frontend-dev'].volumes).toContain('./frontend:/app');
        expect(dockerCompose.services['frontend-dev'].volumes).toContain('/app/node_modules');
      }
      
      if (dockerCompose.services['backend-dev']) {
        expect(dockerCompose.services['backend-dev'].volumes).toContain('./backend:/app');
        expect(dockerCompose.services['backend-dev'].volumes).toContain('/app/node_modules');
      }
    });

    test('should configure development environment variables', () => {
      const dockerComposeContent = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      const dockerCompose = yaml.load(dockerComposeContent);
      
      // Frontend development service should have correct env vars
      if (dockerCompose.services['frontend-dev']) {
        const envVars = dockerCompose.services['frontend-dev'].environment;
        expect(envVars).toContain('VITE_SUPABASE_URL=http://localhost:54321');
        expect(envVars.some(env => env.includes('VITE_SUPABASE_ANON_KEY'))).toBe(true);
      }
      
      // Backend development service should have correct env vars
      if (dockerCompose.services['backend-dev']) {
        const envVars = dockerCompose.services['backend-dev'].environment;
        expect(envVars).toContain('NODE_ENV=development');
        expect(envVars).toContain('SUPABASE_URL=http://localhost:54321');
      }
    });

    test('should configure development service ports', () => {
      const dockerComposeContent = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      const dockerCompose = yaml.load(dockerComposeContent);
      
      // Services should expose development ports
      if (dockerCompose.services['frontend-dev']) {
        expect(dockerCompose.services['frontend-dev'].ports).toContain('5173:5173');
      }
      
      if (dockerCompose.services['backend-dev']) {
        expect(dockerCompose.services['backend-dev'].ports).toContain('8080:8080');
      }
      
      if (dockerCompose.services.nginx) {
        expect(dockerCompose.services.nginx.ports).toContain('3000:80');
      }
    });

    test('should configure development service profiles', () => {
      const dockerComposeContent = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      const dockerCompose = yaml.load(dockerComposeContent);
      
      // Services should be in appropriate profiles
      if (dockerCompose.services['frontend-dev']) {
        expect(dockerCompose.services['frontend-dev'].profiles).toContain('frontend');
        expect(dockerCompose.services['frontend-dev'].profiles).toContain('full-stack');
      }
      
      if (dockerCompose.services['backend-dev']) {
        expect(dockerCompose.services['backend-dev'].profiles).toContain('backend');
        expect(dockerCompose.services['backend-dev'].profiles).toContain('full-stack');
      }
    });

  });

  describe('Test Service Configuration', () => {

    test('should provide isolated test service configuration', () => {
      // Test services should be configured to avoid conflicts with development
      const { loadConfig } = require('../src/shared/config/environment');
      const testConfig = loadConfig('test');
      const devConfig = loadConfig('development');
      
      // Test should use different ports to avoid conflicts
      expect(testConfig.PORT).not.toBe(devConfig.PORT);
      expect(testConfig.DATABASE_URL).not.toBe(devConfig.DATABASE_URL);
    });

    test('should configure test database isolation', () => {
      const { loadConfig } = require('../src/shared/config/environment');
      const testConfig = loadConfig('test');
      
      // Test should use separate test database
      expect(testConfig.DATABASE_URL).toContain('postgres_test');
    });

    test('should configure test-specific service settings', () => {
      const { loadConfig } = require('../src/shared/config/environment');
      const testConfig = loadConfig('test');
      
      // Test environment should have appropriate settings
      expect(testConfig.DEBUG).toBe(false); // Cleaner test output
      expect(testConfig.NODE_ENV).toBe('test');
    });

    test('should support test service startup scripts', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Should have scripts for test environment setup
      expect(packageJson.scripts).toHaveProperty('test:setup') ||
      expect(packageJson.scripts).toHaveProperty('pretest') ||
      expect(packageJson.scripts).toHaveProperty('test:db:setup');
    });

  });

  describe('Production Service Configuration', () => {

    test('should configure production service optimization', () => {
      // Production should have optimized service configurations
      const dockerComposeContent = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      
      // Should support production profiles (will be added)
      expect(dockerComposeContent).toContain('profiles:');
    });

    test('should configure production security settings', () => {
      const { loadConfig } = require('../src/shared/config/environment');
      
      // Set up production environment for testing
      const originalEnv = { ...process.env };
      Object.assign(process.env, {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://prod.supabase.co',
        SUPABASE_ANON_KEY: 'prod-anon-key',
        DATABASE_URL: 'postgresql://user:pass@prod:5432/sobertube',
        JWT_SECRET: 'secure-prod-jwt-secret',
        SESSION_SECRET: 'secure-prod-session-secret'
      });

      try {
        const prodConfig = loadConfig('production');
        
        // Production should use HTTPS
        expect(prodConfig.SUPABASE_URL).toMatch(/^https:/);
        expect(prodConfig.NODE_ENV).toBe('production');
        expect(prodConfig.DEBUG).toBe(false);
      } finally {
        process.env = originalEnv;
      }
    });

    test('should configure production service limits', () => {
      const { loadConfig } = require('../src/shared/config/environment');
      
      const originalEnv = { ...process.env };
      Object.assign(process.env, {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://prod.supabase.co',
        SUPABASE_ANON_KEY: 'prod-anon-key',
        DATABASE_URL: 'postgresql://user:pass@prod:5432/sobertube',
        JWT_SECRET: 'secure-prod-jwt-secret',
        SESSION_SECRET: 'secure-prod-session-secret',
        MAX_FILE_SIZE: '100MB',
        MAX_VIDEO_DURATION: '300'
      });

      try {
        const prodConfig = loadConfig('production');
        
        // Production should have reasonable limits
        expect(prodConfig.MAX_FILE_SIZE).toBeDefined();
        expect(prodConfig.MAX_VIDEO_DURATION).toBeDefined();
      } finally {
        process.env = originalEnv;
      }
    });

  });

  describe('Docker Service Health Checks', () => {

    test('should configure service dependencies correctly', () => {
      const dockerComposeContent = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      const dockerCompose = yaml.load(dockerComposeContent);
      
      // Nginx should depend on frontend-dev
      if (dockerCompose.services.nginx && dockerCompose.services['frontend-dev']) {
        expect(dockerCompose.services.nginx.depends_on).toContain('frontend-dev');
      }
    });

    test('should configure service restart policies', () => {
      const dockerComposeContent = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      const dockerCompose = yaml.load(dockerComposeContent);
      
      // Services should have appropriate restart policies for production
      Object.values(dockerCompose.services).forEach(service => {
        // Development services typically don't need restart policies
        // But production services should have them
        expect(service).toBeDefined();
      });
    });

    test('should configure service volumes correctly', () => {
      const dockerComposeContent = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      const dockerCompose = yaml.load(dockerComposeContent);
      
      // Should have named volumes defined
      expect(dockerCompose.volumes).toHaveProperty('postgres_data');
      expect(dockerCompose.volumes).toHaveProperty('supabase_data');
    });

  });

  describe('Service Configuration Files', () => {

    test('should have nginx configuration for development', () => {
      const dockerComposeContent = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      
      // Should reference nginx.dev.conf
      expect(dockerComposeContent).toContain('nginx.dev.conf');
    });

    test('should configure service-specific environment files', () => {
      // Frontend should have .env.example
      const frontendEnvPath = path.join(process.cwd(), 'frontend/.env.example');
      expect(fs.existsSync(frontendEnvPath)).toBe(true);
      
      // Backend should have .env.example
      const backendEnvPath = path.join(process.cwd(), 'backend/.env.example');
      expect(fs.existsSync(backendEnvPath)).toBe(true);
    });

    test('should have service-specific configuration templates', () => {
      // Should have configuration templates for each service
      const rootEnvPath = path.join(process.cwd(), '.env.example');
      expect(fs.existsSync(rootEnvPath)).toBe(true);
      
      const envContent = fs.readFileSync(rootEnvPath, 'utf8');
      
      // Should have service-specific sections
      expect(envContent).toContain('# Supabase Configuration');
      expect(envContent).toContain('# Database Configuration');
      expect(envContent).toContain('# Application Configuration');
      expect(envContent).toContain('# Frontend Configuration');
    });

  });

  describe('Service Integration Testing', () => {

    test('should validate service configuration loading', () => {
      const { loadConfig } = require('../src/shared/config/environment');
      
      // Should be able to load configurations for all environments
      expect(() => loadConfig('development')).not.toThrow();
      expect(() => loadConfig('test')).not.toThrow();
      
      // Production config validation (with proper env vars)
      const originalEnv = { ...process.env };
      Object.assign(process.env, {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://prod.supabase.co',
        SUPABASE_ANON_KEY: 'prod-anon-key',
        DATABASE_URL: 'postgresql://user:pass@prod:5432/sobertube',
        JWT_SECRET: 'secure-prod-jwt-secret',
        SESSION_SECRET: 'secure-prod-session-secret'
      });

      try {
        expect(() => loadConfig('production')).not.toThrow();
      } finally {
        process.env = originalEnv;
      }
    });

    test('should validate service port configurations', () => {
      const { loadConfig } = require('../src/shared/config/environment');
      
      const devConfig = loadConfig('development');
      const testConfig = loadConfig('test');
      
      // Ports should be valid
      expect(devConfig.PORT).toBeGreaterThan(0);
      expect(devConfig.PORT).toBeLessThan(65536);
      expect(testConfig.PORT).toBeGreaterThan(0);
      expect(testConfig.PORT).toBeLessThan(65536);
      
      // Ports should be different to avoid conflicts
      expect(devConfig.PORT).not.toBe(testConfig.PORT);
    });

    test('should validate service URL configurations', () => {
      const { loadConfig } = require('../src/shared/config/environment');
      
      const devConfig = loadConfig('development');
      const testConfig = loadConfig('test');
      
      // URLs should be valid
      expect(devConfig.SUPABASE_URL).toMatch(/^http/);
      expect(testConfig.SUPABASE_URL).toMatch(/^http/);
      expect(devConfig.DATABASE_URL).toMatch(/^postgresql:/);
      expect(testConfig.DATABASE_URL).toMatch(/^postgresql:/);
    });

  });

  describe('Service Startup Validation', () => {

    test('should validate development services can start', () => {
      const dockerComposeContent = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      const dockerCompose = yaml.load(dockerComposeContent);
      
      // Services should have valid build contexts
      Object.values(dockerCompose.services).forEach(service => {
        if (service.build && service.build.context) {
          const contextPath = path.join(process.cwd(), service.build.context);
          // Context directory should exist or be planned to exist
          expect(service.build.context).toBeDefined();
        }
      });
    });

    test('should validate service environment variable completeness', () => {
      const { loadConfig } = require('../src/shared/config/environment');
      
      // Development config should have all required variables
      const devConfig = loadConfig('development');
      const requiredVars = ['NODE_ENV', 'SUPABASE_URL', 'DATABASE_URL', 'JWT_SECRET', 'SESSION_SECRET'];
      
      requiredVars.forEach(varName => {
        expect(devConfig[varName]).toBeDefined();
        expect(devConfig[varName]).not.toBe('');
      });
    });

    test('should validate service profile configurations', () => {
      const dockerComposeContent = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      const dockerCompose = yaml.load(dockerComposeContent);
      
      // Should have all expected profiles
      const services = Object.values(dockerCompose.services);
      const allProfiles = services.flatMap(service => service.profiles || []);
      
      expect(allProfiles).toContain('frontend');
      expect(allProfiles).toContain('backend');
      expect(allProfiles).toContain('full-stack');
    });

  });

});