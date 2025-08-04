/**
 * Backend directory structure tests
 * Ensures proper organization of controllers, models, routes, and middleware
 */

import { existsSync } from 'fs';
import path from 'path';

describe('Backend Directory Structure', () => {
  const srcPath = path.join(__dirname, '../src');

  describe('Core Directories', () => {
    test('should have controllers directory', () => {
      const controllersPath = path.join(srcPath, 'controllers');
      expect(existsSync(controllersPath)).toBe(true);
    });

    test('should have models directory', () => {
      const modelsPath = path.join(srcPath, 'models');
      expect(existsSync(modelsPath)).toBe(true);
    });

    test('should have routes directory', () => {
      const routesPath = path.join(srcPath, 'routes');
      expect(existsSync(routesPath)).toBe(true);
    });

    test('should have middleware directory', () => {
      const middlewarePath = path.join(srcPath, 'middleware');
      expect(existsSync(middlewarePath)).toBe(true);
    });

    test('should have config directory', () => {
      const configPath = path.join(srcPath, 'config');
      expect(existsSync(configPath)).toBe(true);
    });

    test('should have types directory for TypeScript definitions', () => {
      const typesPath = path.join(srcPath, 'types');
      expect(existsSync(typesPath)).toBe(true);
    });

    test('should have utils directory for utility functions', () => {
      const utilsPath = path.join(srcPath, 'utils');
      expect(existsSync(utilsPath)).toBe(true);
    });
  });

  describe('Core Files', () => {
    test('should have main index.ts file', () => {
      const indexPath = path.join(srcPath, 'index.ts');
      expect(existsSync(indexPath)).toBe(true);
    });

    test('should have app.ts for Express app configuration', () => {
      const appPath = path.join(srcPath, 'app.ts');
      expect(existsSync(appPath)).toBe(true);
    });

    test('should have config index file', () => {
      const configIndexPath = path.join(srcPath, 'config', 'index.ts');
      expect(existsSync(configIndexPath)).toBe(true);
    });
  });

  describe('Directory Organization', () => {
    test('src directory should exist and be readable', () => {
      expect(existsSync(srcPath)).toBe(true);
    });

    test('should follow TypeScript project conventions', () => {
      // Check that TypeScript files are being used
      const indexPath = path.join(srcPath, 'index.ts');
      const appPath = path.join(srcPath, 'app.ts');
      
      expect(existsSync(indexPath)).toBe(true);
      expect(existsSync(appPath)).toBe(true);
    });
  });
});