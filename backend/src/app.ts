/**
 * Express Application Configuration
 * Separates app configuration from server startup for better testability
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler, asyncErrorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { RequestLoggerMiddleware, ErrorRequestLogger, PerformanceMonitor } from './middleware/requestLogger';
import { performHealthCheck, performDetailedHealthCheck, updatePerformanceMetrics } from './services/healthCheck';
import testRoutes from './routes/test';
import authRoutes from './routes/auth';
import { logger } from './utils/logger';

const app = express();

// Request logging middleware (should be first to capture all requests)
app.use(RequestLoggerMiddleware);

// Performance monitoring middleware
app.use(PerformanceMonitor);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env['NODE_ENV'] === 'production' 
    ? process.env['FRONTEND_URL'] 
    : true, // Allow all origins in development
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced health check endpoints
app.get('/health', asyncErrorHandler(async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  
  try {
    const healthStatus = await performHealthCheck();
    const responseTime = Date.now() - startTime;
    
    // Update performance metrics
    updatePerformanceMetrics(responseTime);
    
    // Return appropriate status code based on health
    const statusCode = healthStatus.status === 'healthy' ? 200 : 
                      healthStatus.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(healthStatus);
    
    // Log health check result
    logger.info('Health check completed', {
      status: healthStatus.status,
      responseTime,
      requestId: req.requestId
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    updatePerformanceMetrics(responseTime);
    
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
      requestId: req.requestId
    });
    
    // Return unhealthy status
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'sobertube-backend',
      version: process.env['npm_package_version'] || '1.0.0',
      environment: config.nodeEnv,
      error: error instanceof Error ? error.message : 'Health check failed'
    });
  }
}));

// Detailed health check endpoint
app.get('/health/detailed', asyncErrorHandler(async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  
  try {
    const detailedHealth = await performDetailedHealthCheck();
    const responseTime = Date.now() - startTime;
    
    updatePerformanceMetrics(responseTime);
    
    const statusCode = detailedHealth.status === 'healthy' ? 200 : 
                      detailedHealth.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(detailedHealth);
    
    logger.info('Detailed health check completed', {
      status: detailedHealth.status,
      responseTime,
      requestId: req.requestId
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    updatePerformanceMetrics(responseTime);
    
    logger.error('Detailed health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
      requestId: req.requestId
    });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'sobertube-backend',
      error: error instanceof Error ? error.message : 'Detailed health check failed'
    });
  }
}));

// Test routes (only in test environment)
app.use('/test', testRoutes);

// API routes
app.use('/api/auth', authRoutes);

// Error request logging middleware (before error handlers)
app.use(ErrorRequestLogger);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

export { app };