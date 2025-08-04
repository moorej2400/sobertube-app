/**
 * Shared Environment Configuration System for SoberTube
 * 
 * This module provides:
 * - Environment variable validation with type checking
 * - Default value handling
 * - Cross-platform configuration loading (Node.js/Vite)
 * - Clear error reporting for configuration issues
 */

const path = require('path');
const fs = require('fs');

/**
 * Validates environment variables against a schema
 * @param {Object} schema - Schema defining expected variables and their types
 * @param {Object} envVars - Environment variables to validate
 * @returns {Object} Validated and type-converted configuration
 */
function validateEnvironment(schema, envVars) {
  const result = {};
  const errors = [];

  for (const [key, config] of Object.entries(schema)) {
    const value = envVars[key];
    
    // Check required variables
    if (config.required && (value === undefined || value === '')) {
      errors.push(`Missing required environment variable: ${key}`);
      continue;
    }
    
    // Apply default values for optional variables
    if (value === undefined || value === '') {
      if (config.default !== undefined) {
        result[key] = config.default;
        continue;
      }
      continue;
    }

    // Type validation and conversion
    try {
      switch (config.type) {
        case 'string':
          result[key] = String(value);
          break;
          
        case 'number':
          const numValue = Number(value);
          if (isNaN(numValue)) {
            errors.push(`Invalid number value for ${key}: ${value}`);
            continue;
          }
          result[key] = numValue;
          break;
          
        case 'boolean':
          if (['true', '1', 'yes', 'on'].includes(String(value).toLowerCase())) {
            result[key] = true;
          } else if (['false', '0', 'no', 'off'].includes(String(value).toLowerCase())) {
            result[key] = false;
          } else {
            errors.push(`Invalid boolean value for ${key}: ${value}`);
            continue;
          }
          break;
          
        case 'url':
          try {
            new URL(value);
            result[key] = String(value);
          } catch (urlError) {
            errors.push(`Invalid URL format for ${key}: ${value}`);
            continue;
          }
          break;
          
        default:
          result[key] = String(value);
      }
    } catch (typeError) {
      errors.push(`Type conversion error for ${key}: ${typeError.message}`);
    }
  }

  // Report all errors at once
  if (errors.length > 0) {
    if (errors.length === 1) {
      throw new Error(errors[0]);
    } else {
      throw new Error(`Multiple environment variable errors:\n${errors.join('\n')}`);
    }
  }

  return result;
}

/**
 * Environment Configuration Class
 * Provides typed access to configuration values with environment detection
 */
class EnvironmentConfig {
  constructor(envVars) {
    // Define schema for all expected environment variables
    const schema = {
      NODE_ENV: { type: 'string', required: true },
      DATABASE_URL: { type: 'string', required: true },
      SUPABASE_URL: { type: 'url', required: true },
      SUPABASE_ANON_KEY: { type: 'string', required: true },
      SUPABASE_SERVICE_ROLE_KEY: { type: 'string', required: false },
      PORT: { type: 'number', required: false, default: 8080 },
      JWT_SECRET: { type: 'string', required: true },
      SESSION_SECRET: { type: 'string', required: true },
      MAX_FILE_SIZE: { type: 'string', required: false, default: '500MB' },
      MAX_VIDEO_DURATION: { type: 'number', required: false, default: 300 },
      ALLOWED_VIDEO_FORMATS: { type: 'string', required: false, default: 'mp4,mov,avi' },
      ALLOWED_IMAGE_FORMATS: { type: 'string', required: false, default: 'jpg,jpeg,png,webp' },
      DEBUG: { type: 'boolean', required: false, default: false }
    };

    this.config = validateEnvironment(schema, envVars);
  }

  /**
   * Get a configuration value
   * @param {string} key - Configuration key
   * @returns {any} Configuration value
   */
  get(key) {
    return this.config[key];
  }

  /**
   * Check if running in development environment
   * @returns {boolean}
   */
  isDevelopment() {
    return this.config.NODE_ENV === 'development';
  }

  /**
   * Check if running in production environment
   * @returns {boolean}
   */
  isProduction() {
    return this.config.NODE_ENV === 'production';
  }

  /**
   * Check if running in test environment
   * @returns {boolean}
   */
  isTest() {
    return this.config.NODE_ENV === 'test';
  }

  /**
   * Get all configuration as object
   * @returns {Object}
   */
  getAll() {
    return { ...this.config };
  }
}

/**
 * Load configuration for specific environment
 * @param {string} environment - Environment name (development, test, production)
 * @returns {Object} Configuration object
 */
function loadConfig(environment) {
  // Load environment variables from process.env or .env files
  require('dotenv').config();
  
  // Set NODE_ENV if provided
  if (environment) {
    process.env.NODE_ENV = environment;
  }

  // Environment-specific defaults and validation
  const envVars = { ...process.env };
  
  // Apply environment-specific defaults and overrides
  switch (environment) {
    case 'development':
      envVars.NODE_ENV = 'development';
      envVars.PORT = envVars.PORT || '8080';
      envVars.DEBUG = envVars.DEBUG || 'true';
      // Use development defaults from .env.example if not set
      envVars.SUPABASE_URL = envVars.SUPABASE_URL || 'http://localhost:54321';
      envVars.SUPABASE_ANON_KEY = envVars.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
      envVars.DATABASE_URL = envVars.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres';
      envVars.JWT_SECRET = envVars.JWT_SECRET || 'dev-jwt-secret-key';
      envVars.SESSION_SECRET = envVars.SESSION_SECRET || 'dev-session-secret-key';
      break;
      
    case 'test':
      envVars.NODE_ENV = 'test';
      // Force test environment to use different port for isolation
      envVars.PORT = '8081';
      envVars.DEBUG = 'false';
      // Use test-specific settings
      envVars.SUPABASE_URL = envVars.SUPABASE_URL || 'http://localhost:54321';
      envVars.SUPABASE_ANON_KEY = envVars.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
      // Force test database for isolation
      envVars.DATABASE_URL = (envVars.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres').replace(/\/postgres$/, '/postgres_test');
      envVars.JWT_SECRET = 'test-jwt-secret-key';
      envVars.SESSION_SECRET = 'test-session-secret-key';
      break;
      
    case 'production':
      envVars.NODE_ENV = 'production';
      envVars.PORT = envVars.PORT || '3000';
      envVars.DEBUG = envVars.DEBUG || 'false';
      
      // Production should not use development secrets
      if (envVars.JWT_SECRET === 'your-super-secret-jwt-key-change-in-production') {
        throw new Error('Production environment requires secure JWT_SECRET');
      }
      if (envVars.SESSION_SECRET === 'your-super-secret-session-key-change-in-production') {
        throw new Error('Production environment requires secure SESSION_SECRET');
      }
      
      // Production environment MUST have all required variables explicitly set
      // No defaults provided - this forces proper configuration in deployments
      break;
  }

  // Create and validate configuration
  const config = new EnvironmentConfig(envVars);
  return config.getAll();
}

/**
 * Generate frontend-compatible configuration
 * Filters out backend-only secrets and adds VITE_ prefix where needed
 * @param {Object} envVars - Environment variables
 * @returns {Object} Frontend-safe configuration
 */
function generateFrontendConfig(envVars) {
  const frontendSafeKeys = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY', 
    'VITE_API_BASE_URL',
    'VITE_MAX_FILE_SIZE',
    'VITE_MAX_VIDEO_DURATION',
    'VITE_ALLOWED_VIDEO_FORMATS',
    'VITE_ALLOWED_IMAGE_FORMATS'
  ];

  const frontendConfig = {};
  
  // Copy VITE_ prefixed variables
  for (const key of frontendSafeKeys) {
    if (envVars[key]) {
      frontendConfig[key] = envVars[key];
    }
  }

  // Add VITE_ prefixed versions of safe backend variables
  if (envVars.SUPABASE_URL) {
    frontendConfig.VITE_SUPABASE_URL = envVars.SUPABASE_URL;
  }
  if (envVars.SUPABASE_ANON_KEY) {
    frontendConfig.VITE_SUPABASE_ANON_KEY = envVars.SUPABASE_ANON_KEY;
  }
  if (envVars.PORT) {
    frontendConfig.VITE_API_BASE_URL = `http://localhost:${envVars.PORT}`;
  }

  return frontendConfig;
}

module.exports = {
  EnvironmentConfig,
  validateEnvironment,
  loadConfig,
  generateFrontendConfig
};