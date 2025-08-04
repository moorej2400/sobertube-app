/**
 * TypeScript compilation and build process tests
 * Ensures TypeScript compiles correctly and build outputs are valid
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

describe('TypeScript Compilation', () => {
  const distPath = path.join(__dirname, '../../dist');

  beforeAll(() => {
    // Clean any existing dist directory
    try {
      execSync('rm -rf dist', { cwd: path.join(__dirname, '../..') });
    } catch (error) {
      // Ignore error if dist doesn't exist
    }
  });

  test('should compile TypeScript without errors', () => {
    expect(() => {
      execSync('npm run build', { 
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe' 
      });
    }).not.toThrow();
  });

  test('should generate dist directory', () => {
    expect(existsSync(distPath)).toBe(true);
  });

  test('should generate main index.js file', () => {
    const indexPath = path.join(distPath, 'index.js');
    expect(existsSync(indexPath)).toBe(true);
  });

  test('should generate source maps', () => {
    const sourceMapPath = path.join(distPath, 'index.js.map');
    expect(existsSync(sourceMapPath)).toBe(true);
  });

  test('should generate declaration files', () => {
    const declarationPath = path.join(distPath, 'index.d.ts');
    expect(existsSync(declarationPath)).toBe(true);
  });
});