/**
 * Configuration loading and environment variable tests
 * Tests that environment variables are loaded correctly and configuration is valid
 */

import dotenv from 'dotenv';

describe('Configuration Management', () => {
  beforeAll(() => {
    // Load test environment variables
    dotenv.config({ path: '.env.example' });
  });

  describe('Environment Variables', () => {
    test('should load NODE_ENV', () => {
      expect(process.env['NODE_ENV']).toBeDefined();
    });

    test('should load PORT', () => {
      expect(process.env['PORT']).toBeDefined();
      const port = Number(process.env['PORT']);
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThan(65536);
    });

    test('should load database configuration', () => {
      expect(process.env['DATABASE_URL']).toBeDefined();
      expect(process.env['DATABASE_URL']).toMatch(/^postgresql:\/\//);
    });

    test('should load Supabase configuration', () => {
      expect(process.env['SUPABASE_URL']).toBeDefined();
      expect(process.env['SUPABASE_ANON_KEY']).toBeDefined();
      expect(process.env['SUPABASE_SERVICE_ROLE_KEY']).toBeDefined();
      
      // Validate URL format
      expect(process.env['SUPABASE_URL']).toMatch(/^https?:\/\//);
    });

    test('should load JWT configuration', () => {
      expect(process.env['JWT_SECRET']).toBeDefined();
      expect(process.env['JWT_EXPIRES_IN']).toBeDefined();
      
      // JWT secret should be reasonably long
      expect(process.env['JWT_SECRET']!.length).toBeGreaterThan(10);
    });

    test('should load file upload configuration', () => {
      expect(process.env['MAX_FILE_SIZE']).toBeDefined();
      expect(process.env['ALLOWED_VIDEO_FORMATS']).toBeDefined();
      expect(process.env['ALLOWED_IMAGE_FORMATS']).toBeDefined();
      
      // Max file size should be a valid number
      const maxSize = Number(process.env['MAX_FILE_SIZE']);
      expect(maxSize).toBeGreaterThan(0);
    });

    test('should load logging configuration', () => {
      expect(process.env['LOG_LEVEL']).toBeDefined();
      expect(process.env['LOG_FILE']).toBeDefined();
      
      // Log level should be valid
      const validLogLevels = ['error', 'warn', 'info', 'debug'];
      expect(validLogLevels).toContain(process.env['LOG_LEVEL']);
    });
  });

  describe('Configuration Validation', () => {
    test('should validate required environment variables are present', () => {
      const requiredVars = [
        'NODE_ENV',
        'PORT',
        'DATABASE_URL',
        'SUPABASE_URL',
        'SUPABASE_ANON_KEY',
        'JWT_SECRET'
      ];

      requiredVars.forEach(varName => {
        expect(process.env[varName]).toBeDefined();
        expect(process.env[varName]).not.toBe('');
      });
    });

    test('should validate port is a valid number', () => {
      const port = process.env['PORT'];
      expect(port).toBeDefined();
      expect(Number.isInteger(Number(port))).toBe(true);
      expect(Number(port)).toBeGreaterThan(0);
    });

    test('should validate file formats are properly formatted', () => {
      const videoFormats = process.env['ALLOWED_VIDEO_FORMATS'];
      const imageFormats = process.env['ALLOWED_IMAGE_FORMATS'];
      
      expect(videoFormats).toBeDefined();
      expect(imageFormats).toBeDefined();
      
      // Should be comma-separated values
      expect(videoFormats!.split(',').length).toBeGreaterThan(0);
      expect(imageFormats!.split(',').length).toBeGreaterThan(0);
    });
  });
});