/**
 * Configuration Management
 * Centralized configuration with validation
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface Config {
  // Server Configuration
  nodeEnv: string;
  port: number;
  
  // Database Configuration
  databaseUrl: string;
  
  // Supabase Configuration
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  
  // JWT Configuration
  jwtSecret: string;
  jwtExpiresIn: string;
  
  // File Upload Configuration
  maxFileSize: number;
  allowedVideoFormats: string[];
  allowedImageFormats: string[];
  
  // Logging Configuration
  logLevel: string;
  logFile: string;
}

/**
 * Validates and parses environment variables
 */
function createConfig(): Config {
  const requiredVars = [
    'NODE_ENV',
    'PORT',
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'JWT_SECRET'
  ];

  // Check required variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }

  const port = Number(process.env['PORT']);
  if (!Number.isInteger(port) || port <= 0 || port >= 65536) {
    throw new Error('PORT must be a valid integer between 1 and 65535');
  }

  const maxFileSize = Number(process.env['MAX_FILE_SIZE'] || '500000000');
  if (!Number.isInteger(maxFileSize) || maxFileSize <= 0) {
    throw new Error('MAX_FILE_SIZE must be a positive integer');
  }

  return {
    nodeEnv: process.env['NODE_ENV']!,
    port,
    databaseUrl: process.env['DATABASE_URL']!,
    supabaseUrl: process.env['SUPABASE_URL']!,
    supabaseAnonKey: process.env['SUPABASE_ANON_KEY']!,
    supabaseServiceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    jwtSecret: process.env['JWT_SECRET']!,
    jwtExpiresIn: process.env['JWT_EXPIRES_IN'] || '30d',
    maxFileSize,
    allowedVideoFormats: (process.env['ALLOWED_VIDEO_FORMATS'] || 'mp4,mov,avi').split(','),
    allowedImageFormats: (process.env['ALLOWED_IMAGE_FORMATS'] || 'jpg,jpeg,png,gif').split(','),
    logLevel: process.env['LOG_LEVEL'] || 'info',
    logFile: process.env['LOG_FILE'] || 'logs/sobertube-backend.log'
  };
}

export const config = createConfig();