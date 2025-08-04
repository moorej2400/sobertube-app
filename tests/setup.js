// Jest setup file for SoberTube tests
// This file runs before all test suites

// Load environment variables
require('dotenv').config();

// Set default test timeout
jest.setTimeout(30000);

// Global test setup
console.log('Setting up SoberTube test environment...');
console.log('Node environment:', process.env.NODE_ENV || 'test');