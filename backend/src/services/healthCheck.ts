/**
 * Enhanced Health Check Service
 * Provides comprehensive health monitoring with dependency checks
 */

import { getSupabaseClient } from './supabase';
import { logger } from '../utils/logger';
import { getErrorStats } from '../middleware/errorHandler';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  service: string;
  version: string;
  environment: string;
  uptime: number;
  dependencies: {
    database: DependencyHealth;
  };
  system: SystemMetrics;
  errorRate?: ErrorRateMetrics;
  performance?: PerformanceMetrics;
  configuration?: ConfigurationInfo;
}

interface DependencyHealth {
  status: 'healthy' | 'unhealthy';
  responseTime: number;
  lastChecked: string;
  error?: string;
}

interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
}

interface ErrorRateMetrics {
  last1Hour: number;
  last24Hours: number;
  threshold: number;
}

interface PerformanceMetrics {
  averageResponseTime: number;
  requestsPerMinute: number;
}

interface ConfigurationInfo {
  nodeVersion: string;
  environment: string;
}

// Store for performance metrics
let performanceData = {
  responseTimes: [] as number[],
  requestCount: 0,
  lastMinute: Date.now(),
};

/**
 * Update performance metrics
 */
export function updatePerformanceMetrics(responseTime: number): void {
  const now = Date.now();
  
  // Reset request count every minute
  if (now - performanceData.lastMinute > 60000) {
    performanceData.requestCount = 0;
    performanceData.lastMinute = now;
  }
  
  performanceData.requestCount++;
  performanceData.responseTimes.push(responseTime);
  
  // Keep only last 100 response times
  if (performanceData.responseTimes.length > 100) {
    performanceData.responseTimes = performanceData.responseTimes.slice(-100);
  }
}

/**
 * Check database health
 */
async function checkDatabaseHealth(): Promise<DependencyHealth> {
  const startTime = Date.now();
  
  try {
    // Simple query to check connection using auth session check
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.getSession();
    
    const responseTime = Date.now() - startTime;
    
    // If there's a connection error, mark as unhealthy
    if (error && (error.message.includes('connect') || error.message.includes('network'))) {
      throw error;
    }
    
    return {
      status: 'healthy',
      responseTime,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    logger.error('Database health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
    });
    
    return {
      status: 'unhealthy',
      responseTime,
      lastChecked: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get system metrics
 */
function getSystemMetrics(): SystemMetrics {
  const memUsage = process.memoryUsage();
  const totalMemory = require('os').totalmem();
  const usedMemory = memUsage.heapUsed;
  
  return {
    memory: {
      used: usedMemory,
      total: totalMemory,
      percentage: (usedMemory / totalMemory) * 100,
    },
    cpu: {
      usage: process.cpuUsage().system / 1000000, // Convert to percentage approximation
    },
  };
}

/**
 * Get error rate metrics
 */
function getErrorRateMetrics(): ErrorRateMetrics {
  const stats = getErrorStats();
  const threshold = 50; // 50 errors per hour threshold
  
  return {
    last1Hour: stats.lastHour,
    last24Hours: stats.last24Hours,
    threshold,
  };
}

/**
 * Get performance metrics
 */
function getPerformanceMetrics(): PerformanceMetrics {
  const avgResponseTime = performanceData.responseTimes.length > 0
    ? performanceData.responseTimes.reduce((a, b) => a + b, 0) / performanceData.responseTimes.length
    : 0;
  
  return {
    averageResponseTime: Math.round(avgResponseTime),
    requestsPerMinute: performanceData.requestCount,
  };
}

/**
 * Get configuration information
 */
function getConfigurationInfo(): ConfigurationInfo {
  return {
    nodeVersion: process.version,
    environment: process.env['NODE_ENV'] || 'development',
  };
}

/**
 * Determine overall health status
 */
function determineOverallStatus(dependencies: { database: DependencyHealth }, errorRate: ErrorRateMetrics): 'healthy' | 'unhealthy' | 'degraded' {
  // If any critical dependency is unhealthy, mark as unhealthy
  if (dependencies.database.status === 'unhealthy') {
    return 'unhealthy';
  }
  
  // If error rate exceeds threshold, mark as degraded
  if (errorRate.last1Hour > errorRate.threshold) {
    return 'degraded';
  }
  
  return 'healthy';
}

/**
 * Perform basic health check
 */
export async function performHealthCheck(): Promise<HealthStatus> {
  const startTime = process.uptime();
  
  // Check all dependencies
  const databaseHealth = await checkDatabaseHealth();
  
  const dependencies = {
    database: databaseHealth,
  };
  
  const systemMetrics = getSystemMetrics();
  const errorRate = getErrorRateMetrics();
  const overallStatus = determineOverallStatus(dependencies, errorRate);
  
  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    service: 'sobertube-backend',
    version: process.env['npm_package_version'] || '1.0.0',
    environment: process.env['NODE_ENV'] || 'development',
    uptime: Math.floor(startTime),
    dependencies,
    system: systemMetrics,
    errorRate,
  };
}

/**
 * Perform detailed health check
 */
export async function performDetailedHealthCheck(): Promise<HealthStatus> {
  const basicHealth = await performHealthCheck();
  
  return {
    ...basicHealth,
    performance: getPerformanceMetrics(),
    configuration: getConfigurationInfo(),
  };
}