/**
 * Environment-Specific Configuration Tests for SoberTube
 * Phase 1.2.3: Development/Testing/Production Environment Configuration Tests
 * 
 * These tests verify that:
 * - Each environment (dev/test/prod) has proper configurations
 * - Build processes work correctly for each environment
 * - Environment-specific services are configured properly
 * - Environment isolation is maintained for testing
 * - Production security best practices are enforced
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Import our environment configuration system
const { loadConfig } = require('../src/shared/config/environment');

describe('Phase 1.2.3: Environment-Specific Configurations', () => {

  describe('Development Environment Configuration', () => {

    test('should load development environment with correct settings', () => {
      const config = loadConfig('development');
      
      expect(config.NODE_ENV).toBe('development');
      expect(config.PORT).toBe(8080);
      expect(config.DEBUG).toBe(true);
      
      // Development should use local Supabase
      expect(config.SUPABASE_URL).toBe('http://localhost:54321');
      expect(config.DATABASE_URL).toContain('localhost:54322');
      
      // Development can use dev secrets
      expect(config.JWT_SECRET).toBe('dev-jwt-secret-key');
      expect(config.SESSION_SECRET).toBe('dev-session-secret-key');
    });

    test('should enable development-specific features', () => {
      const config = loadConfig('development');
      
      // Hot reload should be enabled (tested via build process)
      expect(config.DEBUG).toBe(true);
      
      // Source maps should be enabled (will be tested in build tests)
      expect(config.NODE_ENV).toBe('development');
    });

    test('should have development-specific file upload limits', () => {
      const config = loadConfig('development');
      
      // Development might have relaxed limits for testing
      expect(config.MAX_FILE_SIZE).toBeDefined();
      expect(config.MAX_VIDEO_DURATION).toBeDefined();
      expect(config.ALLOWED_VIDEO_FORMATS).toBeDefined();
      expect(config.ALLOWED_IMAGE_FORMATS).toBeDefined();
    });

  });

  describe('Test Environment Configuration', () => {

    test('should load test environment with isolated settings', () => {
      const config = loadConfig('test');
      
      expect(config.NODE_ENV).toBe('test');
      expect(config.PORT).toBe(8081); // Different port from development
      expect(config.DEBUG).toBe(false); // Cleaner test output
      
      // Test should use isolated test database
      expect(config.DATABASE_URL).toContain('postgres_test');
      
      // Test can use test-specific secrets
      expect(config.JWT_SECRET).toBe('test-jwt-secret-key');
      expect(config.SESSION_SECRET).toBe('test-session-secret-key');
    });

    test('should ensure test database isolation', () => {
      const config = loadConfig('test');
      
      // Test database should be separate from dev
      expect(config.DATABASE_URL).toContain('postgres_test');
      expect(config.DATABASE_URL).not.toContain('postgres@localhost:54322/postgres$');
    });

    test('should have test-appropriate timeouts and limits', () => {
      const config = loadConfig('test');
      
      // Test environment should have sensible defaults for testing
      expect(config.MAX_FILE_SIZE).toBeDefined();
      expect(config.MAX_VIDEO_DURATION).toBeDefined();
    });

  });

  describe('Production Environment Configuration', () => {

    test('should load production environment with secure settings', () => {
      // Set production environment variables to avoid the security check
      const prodEnvVars = {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://test-project.supabase.co',
        SUPABASE_ANON_KEY: 'prod-anon-key-test',
        DATABASE_URL: 'postgresql://user:pass@prod-host:5432/sobertube_prod',
        JWT_SECRET: 'secure-production-jwt-secret-key',
        SESSION_SECRET: 'secure-production-session-secret-key',
        PORT: '3000'
      };

      // Temporarily set env vars for this test
      const originalEnv = { ...process.env };
      Object.assign(process.env, prodEnvVars);

      try {
        const config = loadConfig('production');
        
        expect(config.NODE_ENV).toBe('production');
        expect(config.PORT).toBe(3000);
        expect(config.DEBUG).toBe(false);
        
        // Production should use secure URLs
        expect(config.SUPABASE_URL).toMatch(/^https:/);
        expect(config.DATABASE_URL).not.toContain('localhost');
        
        // Production should not use default dev secrets
        expect(config.JWT_SECRET).not.toBe('dev-jwt-secret-key');
        expect(config.SESSION_SECRET).not.toBe('dev-session-secret-key');
      } finally {
        // Restore original environment
        process.env = originalEnv;
      }
    });

    test('should reject insecure production secrets', () => {
      const insecureEnvVars = {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://test-project.supabase.co',
        SUPABASE_ANON_KEY: 'prod-anon-key',
        DATABASE_URL: 'postgresql://user:pass@prod-host:5432/sobertube_prod',
        JWT_SECRET: 'your-super-secret-jwt-key-change-in-production',
        SESSION_SECRET: 'secure-session-secret',
        PORT: '3000'
      };

      const originalEnv = { ...process.env };
      Object.assign(process.env, insecureEnvVars);

      try {
        expect(() => loadConfig('production')).toThrow('Production environment requires secure JWT_SECRET');
      } finally {
        process.env = originalEnv;
      }
    });

    test('should enforce production security requirements', () => {
      const insecureSessionEnvVars = {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://test-project.supabase.co',
        SUPABASE_ANON_KEY: 'prod-anon-key',
        DATABASE_URL: 'postgresql://user:pass@prod-host:5432/sobertube_prod',
        JWT_SECRET: 'secure-jwt-secret',
        SESSION_SECRET: 'your-super-secret-session-key-change-in-production',
        PORT: '3000'
      };

      const originalEnv = { ...process.env };
      Object.assign(process.env, insecureSessionEnvVars);

      try {
        expect(() => loadConfig('production')).toThrow('Production environment requires secure SESSION_SECRET');
      } finally {
        process.env = originalEnv;
      }
    });

  });

  describe('Environment-Specific Build Processes', () => {

    beforeAll(() => {
      // Ensure we have package.json files for build testing
      const rootPackageExists = fs.existsSync(path.join(process.cwd(), 'package.json'));
      const backendPackageExists = fs.existsSync(path.join(process.cwd(), 'backend/package.json'));
      const frontendViteConfigExists = fs.existsSync(path.join(process.cwd(), 'frontend/vite.config.ts'));
      
      if (!rootPackageExists) {
        throw new Error('Root package.json not found - required for build tests');
      }
    });

    test('should have development build script with hot reload', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Should have dev script for hot reload
      expect(packageJson.scripts).toHaveProperty('dev');
      expect(packageJson.scripts).toHaveProperty('dev:backend');
      expect(packageJson.scripts).toHaveProperty('dev:frontend');
    });

    test('should have test build script with coverage', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Should have test scripts
      expect(packageJson.scripts).toHaveProperty('test');
      expect(packageJson.scripts).toHaveProperty('test:coverage');
      expect(packageJson.scripts).toHaveProperty('test:watch');
    });

    test('should have production build script with optimization', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Should have production build scripts
      expect(packageJson.scripts).toHaveProperty('build');
      expect(packageJson.scripts).toHaveProperty('build:backend');
      expect(packageJson.scripts).toHaveProperty('build:frontend');
    });

    test('should configure frontend build process correctly', () => {
      const viteConfigPath = path.join(process.cwd(), 'frontend/vite.config.ts');
      if (fs.existsSync(viteConfigPath)) {
        const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
        
        // Should have environment-specific configuration
        expect(viteConfig).toContain('define');
        expect(viteConfig).toContain('build');
      }
    });

  });

  describe('Environment-Specific Docker Configurations', () => {

    test('should have docker-compose configurations for each environment', () => {
      // Check for main docker-compose.yml
      const dockerComposePath = path.join(process.cwd(), 'docker-compose.yml');
      expect(fs.existsSync(dockerComposePath)).toBe(true);
      
      const dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf8');
      
      // Should have service profiles for different environments
      expect(dockerComposeContent).toContain('profiles:');
      expect(dockerComposeContent).toContain('frontend');
      expect(dockerComposeContent).toContain('backend');
      expect(dockerComposeContent).toContain('full-stack');
    });

    test('should have development docker configuration', () => {
      const dockerComposePath = path.join(process.cwd(), 'docker-compose.yml');
      const dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf8');
      
      // Development configuration should have volume mounts for hot reload
      expect(dockerComposeContent).toContain('volumes:');
      expect(dockerComposeContent).toContain('./frontend:/app');
      expect(dockerComposeContent).toContain('./backend:/app');
      
      // Should have development environment variables
      expect(dockerComposeContent).toContain('NODE_ENV=development');
    });

    test('should configure environment-specific ports correctly', () => {
      const dockerComposePath = path.join(process.cwd(), 'docker-compose.yml');
      const dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf8');
      
      // Should expose correct ports for development
      expect(dockerComposeContent).toContain('5173:5173'); // Frontend dev server
      expect(dockerComposeContent).toContain('8080:8080'); // Backend dev server
      expect(dockerComposeContent).toContain('3000:80');   // Nginx proxy
    });

  });

  describe('Environment Isolation and Testing', () => {

    test('should provide isolated test database configuration', () => {
      const testConfig = loadConfig('test');
      const devConfig = loadConfig('development');
      
      // Test and dev should use different databases
      expect(testConfig.DATABASE_URL).not.toBe(devConfig.DATABASE_URL);
      expect(testConfig.PORT).not.toBe(devConfig.PORT);
    });

    test('should handle environment-specific service configurations', () => {
      const devConfig = loadConfig('development');
      const testConfig = loadConfig('test');
      
      // Both should have required services configured
      expect(devConfig.SUPABASE_URL).toBeDefined();
      expect(testConfig.SUPABASE_URL).toBeDefined();
      
      // But may have different endpoints for isolation
      expect(devConfig.PORT).toBe(8080);
      expect(testConfig.PORT).toBe(8081);
    });

    test('should validate environment switching works correctly', () => {
      // Test that we can switch between environments
      const devConfig = loadConfig('development');
      const testConfig = loadConfig('test');
      const prodConfig = loadConfig('production');
      
      expect(devConfig.NODE_ENV).toBe('development');
      expect(testConfig.NODE_ENV).toBe('test');
      expect(prodConfig.NODE_ENV).toBe('production');
      
      // Each should have appropriate settings
      expect(devConfig.DEBUG).toBe(true);
      expect(testConfig.DEBUG).toBe(false);
      expect(prodConfig.DEBUG).toBe(false);
    });

  });

  describe('Environment-Specific Service Startup', () => {

    test('should validate development services can start', () => {
      // Test that development configuration is valid for service startup
      const config = loadConfig('development');
      
      expect(config.SUPABASE_URL).toMatch(/^http:\/\/localhost/);
      expect(config.DATABASE_URL).toContain('localhost');
      expect(config.PORT).toBeGreaterThan(0);
      expect(config.PORT).toBeLessThan(65536);
    });

    test('should validate test services can start in isolation', () => {
      // Test that test configuration provides proper isolation
      const config = loadConfig('test');
      
      expect(config.DATABASE_URL).toContain('postgres_test');
      expect(config.PORT).toBeGreaterThan(0);
      expect(config.PORT).toBeLessThan(65536);
      
      // Test port should be different from dev to avoid conflicts
      const devConfig = loadConfig('development');
      expect(config.PORT).not.toBe(devConfig.PORT);
    });

    test('should validate production configuration completeness', () => {
      // Test that production configuration has all required values
      const originalEnv = { ...process.env };
      
      // Set minimal production environment
      Object.assign(process.env, {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://prod.supabase.co',
        SUPABASE_ANON_KEY: 'prod-anon-key',
        DATABASE_URL: 'postgresql://user:pass@prod:5432/sobertube',
        JWT_SECRET: 'secure-prod-jwt-secret',
        SESSION_SECRET: 'secure-prod-session-secret'
      });

      try {
        const config = loadConfig('production');
        
        // Should have all required production settings
        expect(config.SUPABASE_URL).toMatch(/^https:/);
        expect(config.DATABASE_URL).toBeDefined();
        expect(config.JWT_SECRET).toBeDefined();
        expect(config.SESSION_SECRET).toBeDefined();
        expect(config.NODE_ENV).toBe('production');
      } finally {
        process.env = originalEnv;
      }
    });

  });

});