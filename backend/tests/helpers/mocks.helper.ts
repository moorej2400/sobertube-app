/**
 * Mock Service Configuration Helper
 * Provides mock implementations for external dependencies
 */

import { jest } from '@jest/globals';

/**
 * Mock Supabase client for testing
 */
export const mockSupabaseClient = {
  auth: {
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signIn: jest.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
    signUp: jest.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
  },
  
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  }),
  
  storage: {
    from: jest.fn().mockReturnValue({
      upload: jest.fn().mockResolvedValue({ data: null, error: null }),
      download: jest.fn().mockResolvedValue({ data: null, error: null }),
      remove: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
};

/**
 * Mock JWT utilities for testing
 */
export const mockJwtUtils = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  verify: jest.fn().mockReturnValue({ userId: 'test-user-id' }),
  decode: jest.fn().mockReturnValue({ userId: 'test-user-id' }),
};/**
 * Mock file upload utilities
 */
export const mockFileUpload = {
  multer: {
    single: jest.fn().mockImplementation(() => (req: any, res: any, next: any) => {
      req.file = {
        fieldname: 'video',
        originalname: 'test.mp4',
        encoding: '7bit',
        mimetype: 'video/mp4',
        buffer: Buffer.from('mock video data'),
        size: 1024,
      };
      next();
    }),
    
    array: jest.fn().mockImplementation(() => (req: any, res: any, next: any) => {
      req.files = [{
        fieldname: 'videos',
        originalname: 'test1.mp4',
        encoding: '7bit',
        mimetype: 'video/mp4',
        buffer: Buffer.from('mock video data 1'),
        size: 1024,
      }];
      next();
    }),
  },
};

/**
 * Mock external API services
 */
export const mockExternalServices = {
  videoProcessing: {
    processVideo: jest.fn().mockResolvedValue({
      success: true,
      processedUrl: 'https://example.com/processed-video.mp4',
      thumbnail: 'https://example.com/thumbnail.jpg',
    }),
    
    generateThumbnail: jest.fn().mockResolvedValue({
      success: true,
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
    }),
  },
  
  emailService: {
    sendEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-id' }),
    sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
  },
};/**
 * Setup mock implementations for all external services
 */
export function setupMocks() {
  // Mock Supabase
  jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn().mockReturnValue(mockSupabaseClient),
  }));
  
  // Mock JWT
  jest.mock('jsonwebtoken', () => mockJwtUtils);
  
  // Mock Winston logger
  jest.mock('winston', () => ({
    createLogger: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      json: jest.fn(),
    },
    transports: {
      Console: jest.fn(),
      File: jest.fn(),
    },
  }));
}

/**
 * Reset all mocks to clean state
 */
export function resetMocks() {
  Object.values(mockSupabaseClient.auth).forEach(mock => {
    if (jest.isMockFunction(mock)) {
      mock.mockClear();
    }
  });
  
  Object.values(mockJwtUtils).forEach(mock => {
    if (jest.isMockFunction(mock)) {
      mock.mockClear();
    }
  });
  
  Object.values(mockExternalServices.videoProcessing).forEach(mock => {
    if (jest.isMockFunction(mock)) {
      mock.mockClear();
    }
  });
  
  Object.values(mockExternalServices.emailService).forEach(mock => {
    if (jest.isMockFunction(mock)) {
      mock.mockClear();
    }
  });
}