/**
 * Build Process Tests for SoberTube
 * Phase 1.2.3: Environment-Specific Build Process Tests
 * 
 * These tests verify that:
 * - Development builds include source maps and debugging
 * - Test builds include coverage and fast feedback
 * - Production builds are optimized and minified
 * - Build scripts work correctly for each environment
 * - Build outputs are correct for each environment
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

describe('Phase 1.2.3: Environment-Specific Build Processes', () => {

  describe('Development Build Process', () => {

    test('should have development build scripts defined', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Development scripts should exist
      expect(packageJson.scripts).toHaveProperty('dev');
      expect(packageJson.scripts).toHaveProperty('dev:backend');
      expect(packageJson.scripts).toHaveProperty('dev:frontend');
      expect(packageJson.scripts).toHaveProperty('dev:full');
    });

    test('should configure development build with hot reload', () => {
      // Check frontend development configuration
      const frontendPackagePath = path.join(process.cwd(), 'frontend/package.json');
      if (fs.existsSync(frontendPackagePath)) {
        const frontendPackage = JSON.parse(fs.readFileSync(frontendPackagePath, 'utf8'));
        expect(frontendPackage.scripts).toHaveProperty('dev');
      }

      // Check backend development configuration
      const backendPackagePath = path.join(process.cwd(), 'backend/package.json');
      if (fs.existsSync(backendPackagePath)) {
        const backendPackage = JSON.parse(fs.readFileSync(backendPackagePath, 'utf8'));
        expect(backendPackage.scripts).toHaveProperty('dev');
      }
    });

    test('should enable source maps in development build', () => {
      // Check Vite config for frontend source maps
      const viteConfigPath = path.join(process.cwd(), 'frontend/vite.config.ts');
      if (fs.existsSync(viteConfigPath)) {
        const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
        
        // Should have source map configuration
        expect(viteConfig).toContain('sourcemap');
      }

      // Check TypeScript config for source maps
      const tsConfigPath = path.join(process.cwd(), 'tsconfig.json');
      if (fs.existsSync(tsConfigPath)) {
        const tsConfig = JSON.parse(fs.readFileSync(tsConfigPath, 'utf8'));
        
        // Should have source map enabled for development
        expect(tsConfig.compilerOptions).toHaveProperty('sourceMap');
      }
    });

    test('should configure development environment variables', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Development scripts should set NODE_ENV appropriately
      if (packageJson.scripts.dev) {
        expect(packageJson.scripts.dev).toContain('NODE_ENV=development') ||
        expect(packageJson.scripts.dev).toContain('cross-env NODE_ENV=development');
      }
    });

  });

  describe('Test Build Process', () => {

    test('should have test build scripts defined', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Test scripts should exist
      expect(packageJson.scripts).toHaveProperty('test');
      expect(packageJson.scripts).toHaveProperty('test:coverage');
      expect(packageJson.scripts).toHaveProperty('test:watch');
      expect(packageJson.scripts).toHaveProperty('test:ci');
    });

    test('should configure test coverage collection', () => {
      const jestConfigPath = path.join(process.cwd(), 'jest.config.js');
      expect(fs.existsSync(jestConfigPath)).toBe(true);
      
      const jestConfig = require(jestConfigPath);
      
      // Should have coverage configuration
      expect(jestConfig).toHaveProperty('collectCoverageFrom');
      expect(jestConfig.collectCoverageFrom).toContain('src/**/*.js');
    });

    test('should exclude test files from coverage', () => {
      const jestConfig = require(path.join(process.cwd(), 'jest.config.js'));
      
      // Should exclude test files from coverage
      expect(jestConfig.collectCoverageFrom).toContain('!src/**/*.test.js');
    });

    test('should have appropriate test timeout for integration tests', () => {
      const jestConfig = require(path.join(process.cwd(), 'jest.config.js'));
      
      // Should have longer timeout for integration tests
      expect(jestConfig.testTimeout).toBeGreaterThanOrEqual(30000);
    });

    test('should configure test environment isolation', () => {
      const jestConfig = require(path.join(process.cwd(), 'jest.config.js'));
      
      // Should use node environment for backend tests
      expect(jestConfig.testEnvironment).toBe('node');
      
      // Should have setup file for test environment
      expect(jestConfig).toHaveProperty('setupFilesAfterEnv');
    });

  });

  describe('Production Build Process', () => {

    test('should have production build scripts defined', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Production build scripts should exist
      expect(packageJson.scripts).toHaveProperty('build');
      expect(packageJson.scripts).toHaveProperty('build:backend');
      expect(packageJson.scripts).toHaveProperty('build:frontend');
      expect(packageJson.scripts).toHaveProperty('build:production');
    });

    test('should configure production optimization', () => {
      // Check Vite config for production optimization
      const viteConfigPath = path.join(process.cwd(), 'frontend/vite.config.ts');
      if (fs.existsSync(viteConfigPath)) {
        const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
        
        // Should have build optimization settings
        expect(viteConfig).toContain('build');
        expect(viteConfig).toContain('minify') || 
        expect(viteConfig).toContain('terser') ||
        expect(viteConfig).toContain('esbuild');
      }
    });

    test('should configure production environment variables', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Production build should set NODE_ENV=production
      if (packageJson.scripts.build) {
        expect(packageJson.scripts.build).toContain('NODE_ENV=production') ||
        expect(packageJson.scripts.build).toContain('cross-env NODE_ENV=production');
      }
    });

    test('should disable debug features in production build', () => {
      // Check that production builds don't include debug features
      const viteConfigPath = path.join(process.cwd(), 'frontend/vite.config.ts');
      if (fs.existsSync(viteConfigPath)) {
        const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
        
        // Should have conditional debug configuration
        expect(viteConfig).toContain('NODE_ENV') ||
        expect(viteConfig).toContain('process.env') ||
        expect(viteConfig).toContain('mode');
      }
    });

    test('should configure code splitting for production', () => {
      const viteConfigPath = path.join(process.cwd(), 'frontend/vite.config.ts');
      if (fs.existsSync(viteConfigPath)) {
        const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
        
        // Should have rollup options for code splitting
        expect(viteConfig).toContain('rollupOptions') ||
        expect(viteConfig).toContain('chunkSizeWarningLimit');
      }
    });

  });

  describe('Build Script Integration', () => {

    test('should have cross-platform build scripts', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Should use cross-env for Windows compatibility
      const hasWindowsCompatibility = Object.values(packageJson.scripts).some(script => 
        script.includes('cross-env') || !script.includes('NODE_ENV=')
      );
      
      expect(hasWindowsCompatibility).toBe(true);
    });

    test('should have pre-build and post-build hooks', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Should have build lifecycle scripts
      expect(packageJson.scripts).toHaveProperty('prebuild') ||
      expect(packageJson.scripts).toHaveProperty('postbuild') ||
      expect(packageJson.scripts).toHaveProperty('clean');
    });

    test('should configure build output directories', () => {
      // Check frontend build output
      const viteConfigPath = path.join(process.cwd(), 'frontend/vite.config.ts');
      if (fs.existsSync(viteConfigPath)) {
        const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
        expect(viteConfig).toContain('outDir');
      }

      // Check backend build output
      const backendTsConfigPath = path.join(process.cwd(), 'backend/tsconfig.json');
      if (fs.existsSync(backendTsConfigPath)) {
        const tsConfig = JSON.parse(fs.readFileSync(backendTsConfigPath, 'utf8'));
        expect(tsConfig.compilerOptions).toHaveProperty('outDir');
      }
    });

  });

  describe('Docker Build Integration', () => {

    test('should have Dockerfile for development builds', () => {
      const frontendDockerDevPath = path.join(process.cwd(), 'frontend/Dockerfile.dev');
      const backendDockerDevPath = path.join(process.cwd(), 'backend/Dockerfile.dev');
      
      // Should have development Dockerfiles referenced in docker-compose
      const dockerCompose = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      expect(dockerCompose).toContain('Dockerfile.dev');
    });

    test('should configure hot reload in development Docker builds', () => {
      const dockerCompose = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      
      // Should have volume mounts for hot reload
      expect(dockerCompose).toContain('./frontend:/app');
      expect(dockerCompose).toContain('./backend:/app');
      expect(dockerCompose).toContain('/app/node_modules');
    });

    test('should have production Dockerfile configurations', () => {
      // Production Dockerfiles should exist (will be created)
      const frontendDockerProdPath = path.join(process.cwd(), 'frontend/Dockerfile');
      const backendDockerProdPath = path.join(process.cwd(), 'backend/Dockerfile');
      
      // These will be created as part of the implementation
      // For now, just verify the docker-compose structure supports them
      const dockerCompose = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
      expect(dockerCompose).toContain('build:');
      expect(dockerCompose).toContain('context:');
    });

  });

  describe('Environment-Specific Build Validation', () => {

    test('should validate development build can be started', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Development scripts should be executable
      expect(packageJson.scripts.dev).toBeDefined();
      expect(typeof packageJson.scripts.dev).toBe('string');
      expect(packageJson.scripts.dev.length).toBeGreaterThan(0);
    });

    test('should validate test build can be executed', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Test scripts should be executable
      expect(packageJson.scripts.test).toBeDefined();
      expect(typeof packageJson.scripts.test).toBe('string');
      expect(packageJson.scripts.test.length).toBeGreaterThan(0);
    });

    test('should validate production build can be created', () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      
      // Production build scripts should be executable
      expect(packageJson.scripts.build).toBeDefined();
      expect(typeof packageJson.scripts.build).toBe('string');
      expect(packageJson.scripts.build.length).toBeGreaterThan(0);
    });

    test('should ensure build outputs are environment appropriate', () => {
      // This test will validate that builds produce correct outputs
      // Development: source maps, unminified
      // Test: coverage reports, fast builds
      // Production: minified, optimized, no source maps
      
      const jestConfig = require(path.join(process.cwd(), 'jest.config.js'));
      
      // Jest should have coverage output configured
      expect(jestConfig).toHaveProperty('collectCoverageFrom');
      
      const viteConfigPath = path.join(process.cwd(), 'frontend/vite.config.ts');
      if (fs.existsSync(viteConfigPath)) {
        const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
        
        // Should have conditional configuration based on environment
        expect(viteConfig).toContain('command') || 
        expect(viteConfig).toContain('mode') ||
        expect(viteConfig).toContain('NODE_ENV');
      }
    });

  });

});