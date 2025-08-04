/**
 * Jest test setup for SoberTube Backend
 * Runs before all test suites with enhanced database isolation and cleanup
 */

import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test timeout
jest.setTimeout(30000);

// Global test setup
console.log('Setting up SoberTube Backend test environment...');
console.log('Node environment:', process.env['NODE_ENV'] || 'test');

// Enhanced test database isolation
beforeAll(async () => {
  // Ensure we're in test environment
  if (process.env['NODE_ENV'] !== 'test') {
    throw new Error('Tests must run in NODE_ENV=test environment');
  }
  
  // Only verify database configuration for database-related tests
  // Skip database validation for unit tests that don't require database
  const testFilePath = expect.getState().testPath || '';
  const isUnitTest = testFilePath.includes('/unit/') || 
                     testFilePath.includes('compilation.test') || 
                     testFilePath.includes('logging.test') ||
                     testFilePath.includes('error-handling.test') ||
                     testFilePath.includes('health-check.test') ||
                     testFilePath.includes('server.test');
  
  if (!isUnitTest) {
    // Verify test database configuration
    const testDbUrl = process.env['DATABASE_URL'];
    if (!testDbUrl || !testDbUrl.includes('postgres_test')) {
      throw new Error('Test database URL must contain "postgres_test"');
    }
  }
  
  console.log('✅ Test environment validated');
});

// Test cleanup after each test
afterEach(async () => {
  // Clear any lingering timers
  jest.clearAllTimers();
  
  // Reset all mocks
  jest.clearAllMocks();
});

// Global cleanup
afterAll(async () => {
  // Close any open database connections
  // This will be expanded when we add actual database connections
  console.log('🧹 Test cleanup completed');
});

// Mock console methods in tests to reduce noise
if (process.env['NODE_ENV'] === 'test') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Global test utilities
declare global {
  var testUtils: {
    createTestUser: () => any;
    cleanupTestData: () => Promise<void>;
  };
}

// Test utilities for database operations
(global as any).testUtils = {
  createTestUser: () => ({
    id: `test-user-${Date.now()}`,
    email: `test-${Date.now()}@example.com`,
    name: 'Test User',
    createdAt: new Date().toISOString(),
  }),
  
  cleanupTestData: async () => {
    // Database cleanup will be implemented when we add actual DB operations
    return Promise.resolve();
  },
};