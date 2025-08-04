/**
 * Infrastructure Tests for SoberTube
 * Phase 1.1: Docker Environment Setup Tests
 * 
 * These tests verify that:
 * - Docker services start successfully
 * - Database connection works
 * - Environment variables are properly configured
 */

const { execSync } = require('child_process');
const fetch = require('node-fetch');

// Test configuration
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('Phase 1.1: Docker Environment Setup', () => {
  
  beforeAll(async () => {
    // Ensure Supabase is running before tests
    console.log('Checking Supabase status...');
  });

  describe('Docker Services', () => {
    
    test('Supabase local development should be running', async () => {
      try {
        const output = execSync('./node_modules/supabase/bin/supabase status', { 
          encoding: 'utf8',
          cwd: process.cwd()
        });
        
        // Check that we have the essential URLs indicating Supabase is running
        expect(output).toContain('API URL: http://127.0.0.1:54321');
        expect(output).toContain('DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres');
      } catch (error) {
        throw new Error(`Supabase is not running: ${error.message}`);
      }
    });

    test('Supabase API should be accessible', async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('swagger');
      expect(data.swagger).toBe('2.0');
    });

    test('Supabase Studio should be accessible', async () => {
      const response = await fetch('http://127.0.0.1:54323');
      expect(response.status).toBe(200);
    });

    test('Supabase Storage should be accessible', async () => {
      const response = await fetch(`${SUPABASE_URL}/storage/v1/s3`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY
        }
      });
      
      // Storage endpoint may return different status codes, but should be reachable
      expect(response.status).toBeLessThan(500);
    });

  });

  describe('Database Connection', () => {
    
    test('PostgreSQL database should be accessible', async () => {
      const { Client } = require('pg');
      const client = new Client({
        connectionString: DB_URL,
      });

      try {
        await client.connect();
        
        // Test basic query
        const result = await client.query('SELECT version()');
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].version).toContain('PostgreSQL');
        
        await client.end();
      } catch (error) {
        throw new Error(`Database connection failed: ${error.message}`);
      }
    });

    test('Database should have required extensions', async () => {
      const { Client } = require('pg');
      const client = new Client({
        connectionString: DB_URL,
      });

      try {
        await client.connect();
        
        // Check for common Supabase extensions
        const result = await client.query(`
          SELECT extname FROM pg_extension 
          WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pgjwt')
        `);
        
        const extensions = result.rows.map(row => row.extname);
        expect(extensions).toContain('uuid-ossp');
        expect(extensions).toContain('pgcrypto');
        
        await client.end();
      } catch (error) {
        throw new Error(`Extension check failed: ${error.message}`);
      }
    });

  });

  describe('Environment Variables', () => {
    
    test('Required environment variables should be set', () => {
      // These should be available from .env file or default Supabase values
      const requiredVars = [
        'DATABASE_URL',
        'SUPABASE_URL', 
        'SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY'
      ];

      // Load environment variables from .env file
      require('dotenv').config();

      requiredVars.forEach(varName => {
        const value = process.env[varName];
        expect(value).toBeDefined();
        expect(value).not.toBe('');
      });
    });

    test('Environment variables should have correct format', () => {
      require('dotenv').config();
      
      const dbUrl = process.env.DATABASE_URL;
      expect(dbUrl).toMatch(/^postgresql:\/\//);
      
      const supabaseUrl = process.env.SUPABASE_URL;
      expect(supabaseUrl).toMatch(/^http/);
      
      // JWT tokens should be properly formatted
      const anonKey = process.env.SUPABASE_ANON_KEY;
      expect(anonKey).toMatch(/^eyJ/); // JWT format
    });

  });

  describe('Service Health Checks', () => {
    
    test('All Supabase services should be healthy', async () => {
      // Test multiple endpoints to ensure full stack is working
      const endpoints = [
        { name: 'REST API', url: `${SUPABASE_URL}/rest/v1/` },
        { name: 'Auth', url: `${SUPABASE_URL}/auth/v1/settings` },
        { name: 'Storage', url: `${SUPABASE_URL}/storage/v1/s3` },
        { name: 'Realtime', url: `${SUPABASE_URL}/realtime/v1/` }
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint.url, {
            headers: {
              'apikey': SUPABASE_ANON_KEY
            }
          });
          
          // Services should respond (may have different status codes but should not timeout)
          expect(response.status).toBeLessThan(500);
          console.log(`✓ ${endpoint.name} is responding (${response.status})`);
        } catch (error) {
          throw new Error(`${endpoint.name} health check failed: ${error.message}`);
        }
      }
    });

  });

});

// Cleanup after tests
afterAll(async () => {
  console.log('Infrastructure tests completed');
});