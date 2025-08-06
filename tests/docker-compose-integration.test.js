/**
 * Docker Compose Integration Tests for SoberTube
 * Sub-feature 1.1.1: Service Communication and Health Check Testing
 * 
 * These tests verify that:
 * - Services can start and pass health checks
 * - Internal service communication works correctly
 * - Volume persistence works across restarts
 * 
 * Note: These are integration tests that require Docker to be running
 * and may take longer to execute than unit tests.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const fetch = require('node-fetch');

// Test configuration
const DOCKER_COMPOSE_FILE = 'docker-compose.local.yml';
const TEST_TIMEOUT = 300000; // 5 minutes for integration tests
const STARTUP_WAIT = 30000; // 30 seconds for services to start

// Essential services for testing (subset for performance)
const ESSENTIAL_SERVICES = ['postgres', 'redis', 'minio'];
const FULL_STACK_SERVICES = ['postgres', 'redis', 'minio', 'rest', 'auth', 'realtime', 'storage'];

// Service endpoints for health checks
const SERVICE_ENDPOINTS = {
  postgres: { port: 5433, type: 'tcp' },
  redis: { port: 6379, type: 'tcp' },
  minio: { port: 9000, path: '/minio/health/live' },
  rest: { port: 3000, path: '/' },
  auth: { port: 9999, path: '/health' },
  realtime: { port: 4000, path: '/health' },
  storage: { port: 5000, path: '/status' }
};

describe('Docker Compose Integration Tests', () => {
  
  beforeAll(async () => {
    console.log('Setting up integration tests...');
    
    // Ensure no conflicting services are running
    try {
      execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} down -v --remove-orphans`, { 
        stdio: 'pipe' 
      });
    } catch (error) {
      // Ignore if no services were running
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    console.log('Cleaning up integration tests...');
    
    try {
      execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} down -v --remove-orphans`, { 
        stdio: 'pipe' 
      });
    } catch (error) {
      console.warn('Cleanup warning:', error.message);
    }
  }, TEST_TIMEOUT);

  describe('Essential Services Health Checks', () => {
    
    test('Essential services should start and become healthy', async () => {
      console.log('Starting essential services:', ESSENTIAL_SERVICES.join(', '));
      
      // Start essential services
      execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} up -d ${ESSENTIAL_SERVICES.join(' ')}`, {
        stdio: 'pipe',
        timeout: 60000
      });
      
      // Wait for services to initialize
      console.log('Waiting for services to initialize...');
      await new Promise(resolve => setTimeout(resolve, STARTUP_WAIT));
      
      try {
        // Check service status
        const statusOutput = execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} ps --format json`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        
        const services = JSON.parse('[' + statusOutput.replace(/}\n{/g, '},{') + ']');
        
        for (const serviceName of ESSENTIAL_SERVICES) {
          const service = services.find(s => s.Service === serviceName);
          expect(service).toBeDefined();
          expect(service.State).toMatch(/running|healthy/i);
          console.log(`✓ ${serviceName}: ${service.State}`);
        }
        
        // Test PostgreSQL connection
        await testPostgreSQLConnection();
        
        // Test Redis connection
        await testRedisConnection();
        
        // Test MinIO health
        await testMinIOHealth();
        
      } finally {
        // Clean up
        execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} down -v`, { stdio: 'pipe' });
      }
    }, TEST_TIMEOUT);

  });

  describe('Service Communication Tests', () => {
    
    test('REST API should connect to PostgreSQL when both are running', async () => {
      console.log('Testing REST API to PostgreSQL communication');
      
      // Start postgres and rest services
      execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} up -d postgres rest`, {
        stdio: 'pipe',
        timeout: 90000
      });
      
      // Wait for services to be ready
      console.log('Waiting for PostgreSQL and REST API to be ready...');
      await new Promise(resolve => setTimeout(resolve, 45000));
      
      try {
        // Check PostgreSQL is ready
        const pgStatus = execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} ps postgres --format json`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        
        const pgService = JSON.parse(pgStatus);
        expect(pgService.State).toMatch(/running|healthy/i);
        
        // Check REST API is ready and can connect to PostgreSQL
        const response = await fetch('http://localhost:3000/', {
          timeout: 5000
        });
        
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveProperty('swagger');
        
        console.log('✓ REST API successfully connected to PostgreSQL');
        
      } catch (error) {
        console.error('Service communication test failed:', error.message);
        throw error;
      } finally {
        execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} down -v`, { stdio: 'pipe' });
      }
    }, TEST_TIMEOUT);

  });

  describe('Volume Persistence Tests', () => {
    
    test('PostgreSQL data should persist across container restarts', async () => {
      console.log('Testing PostgreSQL data persistence');
      
      const testData = {
        table: 'test_persistence',
        value: `test_${Date.now()}`
      };
      
      try {
        // Start PostgreSQL
        execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} up -d postgres`, {
          stdio: 'pipe',
          timeout: 60000
        });
        
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Create test data
        const createResult = execSync(`docker exec -e PGPASSWORD=your_super_secure_postgres_password sobertube_postgres psql -U supabase_admin -d postgres -c "CREATE TABLE IF NOT EXISTS ${testData.table} (id SERIAL PRIMARY KEY, value TEXT); INSERT INTO ${testData.table} (value) VALUES ('${testData.value}');"`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        
        expect(createResult).toContain('INSERT');
        
        // Restart container (keeping volume)
        execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} restart postgres`, {
          stdio: 'pipe',
          timeout: 30000
        });
        
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        // Check data persisted
        const queryResult = execSync(`docker exec -e PGPASSWORD=your_super_secure_postgres_password sobertube_postgres psql -U supabase_admin -d postgres -c "SELECT value FROM ${testData.table} WHERE value = '${testData.value}';"`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        
        expect(queryResult).toContain(testData.value);
        console.log('✓ PostgreSQL data persisted across restart');
        
      } finally {
        execSync(`docker-compose -f ${DOCKER_COMPOSE_FILE} down -v`, { stdio: 'pipe' });
      }
    }, TEST_TIMEOUT);

  });

});

// Helper functions for health checks
async function testPostgreSQLConnection() {
  return new Promise((resolve, reject) => {
    const testCommand = `docker exec sobertube_postgres pg_isready -U supabase_admin -d postgres`;
    
    try {
      const result = execSync(testCommand, { encoding: 'utf8', stdio: 'pipe' });
      if (result.includes('accepting connections')) {
        console.log('✓ PostgreSQL is accepting connections');
        resolve(true);
      } else {
        reject(new Error('PostgreSQL not ready: ' + result));
      }
    } catch (error) {
      reject(new Error('PostgreSQL connection test failed: ' + error.message));
    }
  });
}

async function testRedisConnection() {
  return new Promise((resolve, reject) => {
    const testCommand = `docker exec sobertube_redis redis-cli --no-auth-warning -a sobertube_redis_password ping`;
    
    try {
      const result = execSync(testCommand, { encoding: 'utf8', stdio: 'pipe' });
      if (result.trim() === 'PONG') {
        console.log('✓ Redis is responding');
        resolve(true);
      } else {
        reject(new Error('Redis not responding: ' + result));
      }
    } catch (error) {
      reject(new Error('Redis connection test failed: ' + error.message));
    }
  });
}

async function testMinIOHealth() {
  try {
    const response = await fetch('http://localhost:9000/minio/health/live', {
      timeout: 5000
    });
    
    if (response.status === 200) {
      console.log('✓ MinIO health check passed');
      return true;
    } else {
      throw new Error(`MinIO health check failed: ${response.status}`);
    }
  } catch (error) {
    throw new Error('MinIO health test failed: ' + error.message);
  }
}