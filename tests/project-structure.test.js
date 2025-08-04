/**
 * Project Structure Tests for SoberTube
 * Phase 1.2: Project Structure & CI/CD Tests
 * 
 * These tests verify that:
 * - Backend and frontend directories exist with proper structure
 * - Basic configuration files are in place
 * - Development workspace is properly organized
 */

const fs = require('fs');
const path = require('path');

// Test configuration
const PROJECT_ROOT = process.cwd();
const BACKEND_DIR = path.join(PROJECT_ROOT, 'backend');
const FRONTEND_DIR = path.join(PROJECT_ROOT, 'frontend');

describe('Phase 1.2: Project Structure & CI/CD', () => {

  describe('Workspace Structure', () => {
    
    test('backend directory should exist', () => {
      expect(fs.existsSync(BACKEND_DIR)).toBe(true);
      expect(fs.statSync(BACKEND_DIR).isDirectory()).toBe(true);
    });

    test('frontend directory should exist', () => {
      expect(fs.existsSync(FRONTEND_DIR)).toBe(true);
      expect(fs.statSync(FRONTEND_DIR).isDirectory()).toBe(true);
    });

    test('backend should have basic Node.js project structure', () => {
      // Check for essential backend directories
      const essentialDirs = ['src', 'tests'];
      
      essentialDirs.forEach(dir => {
        const dirPath = path.join(BACKEND_DIR, dir);
        expect(fs.existsSync(dirPath)).toBe(true);
        expect(fs.statSync(dirPath).isDirectory()).toBe(true);
      });
    });

    test('frontend should have basic React project structure', () => {
      // Check for essential frontend directories
      const essentialDirs = ['src', 'public'];
      
      essentialDirs.forEach(dir => {
        const dirPath = path.join(FRONTEND_DIR, dir);
        expect(fs.existsSync(dirPath)).toBe(true);
        expect(fs.statSync(dirPath).isDirectory()).toBe(true);
      });
    });

  });

  describe('Backend Configuration', () => {
    
    test('backend should have package.json', () => {
      const packageJsonPath = path.join(BACKEND_DIR, 'package.json');
      expect(fs.existsSync(packageJsonPath)).toBe(true);
      
      // Verify it's valid JSON
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      expect(packageJson.name).toBeDefined();
      expect(packageJson.version).toBeDefined();
    });

    test('backend should have TypeScript configuration', () => {
      const tsconfigPath = path.join(BACKEND_DIR, 'tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      
      // Verify it's valid JSON
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      expect(tsconfig.compilerOptions).toBeDefined();
    });

    test('backend should have Jest configuration', () => {
      const jestConfigPath = path.join(BACKEND_DIR, 'jest.config.js');
      expect(fs.existsSync(jestConfigPath)).toBe(true);
    });

    test('backend should have main entry point', () => {
      const mainEntryPath = path.join(BACKEND_DIR, 'src', 'index.ts');
      expect(fs.existsSync(mainEntryPath)).toBe(true);
    });

  });

  describe('Frontend Configuration', () => {
    
    test('frontend should have package.json', () => {
      const packageJsonPath = path.join(FRONTEND_DIR, 'package.json');
      expect(fs.existsSync(packageJsonPath)).toBe(true);
      
      // Verify it's valid JSON
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      expect(packageJson.name).toBeDefined();
      expect(packageJson.version).toBeDefined();
    });

    test('frontend should have TypeScript configuration', () => {
      const tsconfigPath = path.join(FRONTEND_DIR, 'tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      
      // Verify it's valid JSON
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      expect(tsconfig.compilerOptions).toBeDefined();
    });

    test('frontend should have Vite configuration', () => {
      const viteConfigPath = path.join(FRONTEND_DIR, 'vite.config.ts');
      expect(fs.existsSync(viteConfigPath)).toBe(true);
    });

    test('frontend should have main entry point', () => {
      const mainEntryPath = path.join(FRONTEND_DIR, 'src', 'main.tsx');
      expect(fs.existsSync(mainEntryPath)).toBe(true);
    });

    test('frontend should have index.html', () => {
      const indexHtmlPath = path.join(FRONTEND_DIR, 'index.html');
      expect(fs.existsSync(indexHtmlPath)).toBe(true);
    });

  });

  describe('Environment Configuration', () => {
    
    test('backend should have environment example file', () => {
      const envExamplePath = path.join(BACKEND_DIR, '.env.example');
      expect(fs.existsSync(envExamplePath)).toBe(true);
    });

    test('frontend should have environment example file', () => {
      const envExamplePath = path.join(FRONTEND_DIR, '.env.example');
      expect(fs.existsSync(envExamplePath)).toBe(true);
    });

  });

  describe('Test Structure', () => {
    
    test('backend should have test setup', () => {
      const testSetupPath = path.join(BACKEND_DIR, 'tests', 'setup.ts');
      expect(fs.existsSync(testSetupPath)).toBe(true);
    });

    test('frontend should have test setup', () => {
      const testSetupPath = path.join(FRONTEND_DIR, 'src', 'test-setup.ts');
      expect(fs.existsSync(testSetupPath)).toBe(true);
    });

  });

});