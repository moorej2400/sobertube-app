/**
 * Request/Response Logging Middleware
 * Logs all HTTP requests and responses with structured information
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger, logHelpers } from '../utils/logger';

// Fields to filter from request body for security
const SENSITIVE_FIELDS = ['password', 'token', 'authorization', 'secret', 'key', 'credentials'];

// Extended Request interface to include request ID and start time
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

/**
 * Filter sensitive data from object
 */
function filterSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => filterSensitiveData(item));
  }

  const filtered: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELDS.some(field => lowerKey.includes(field));
    
    if (isSensitive) {
      filtered[key] = '[FILTERED]';
    } else if (typeof value === 'object' && value !== null) {
      filtered[key] = filterSensitiveData(value);
    } else {
      filtered[key] = value;
    }
  }
  
  return filtered;
}

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  return (
    req.headers['x-forwarded-for'] as string ||
    req.headers['x-real-ip'] as string ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/**
 * Request logging middleware
 * Logs incoming requests and outgoing responses
 */
export const RequestLoggerMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Generate unique request ID
  req.requestId = uuidv4();
  req.startTime = Date.now();

  // Add request ID to response headers for debugging
  res.setHeader('X-Request-ID', req.requestId);

  // Skip logging for health check endpoints in production to reduce noise
  const skipLogging = process.env['NODE_ENV'] === 'production' && req.path === '/health';

  if (!skipLogging) {
    // Log request details
    const requestMeta = {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      userAgent: req.headers['user-agent'] || 'unknown',
      ip: getClientIp(req),
      timestamp: new Date().toISOString(),
      ...(req.body && Object.keys(req.body).length > 0 && {
        body: filterSensitiveData(req.body)
      }),
      ...(req.query && Object.keys(req.query).length > 0 && {
        query: req.query
      }),
      ...(req.params && Object.keys(req.params).length > 0 && {
        params: req.params
      })
    };

    logHelpers.logRequest(req.requestId, req.method, req.originalUrl || req.url, requestMeta);
  }

  // Override res.json to capture response data
  const originalJson = res.json;
  let responseBody: any;

  res.json = function(body: any) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    if (!skipLogging) {
      const responseTime = Date.now() - (req.startTime || 0);
      
      const responseMeta = {
        requestId: req.requestId,
        statusCode: res.statusCode,
        responseTime,
        contentLength: res.getHeader('content-length') || 0,
        ...(responseBody && { hasResponseBody: true }),
        ...(res.statusCode >= 400 && responseBody && { responseBody: filterSensitiveData(responseBody) })
      };

      logHelpers.logResponse(req.requestId!, res.statusCode, responseTime, responseMeta);

      // Log slow requests as warnings
      if (responseTime > 1000) {
        logger.warn('Slow request detected', {
          requestId: req.requestId,
          method: req.method,
          url: req.originalUrl || req.url,
          responseTime,
          statusCode: res.statusCode
        });
      }
    }

    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

/**
 * Error request logger
 * Specifically logs requests that result in errors
 */
export const ErrorRequestLogger = (error: Error, req: Request, _res: Response, next: NextFunction): void => {
  if (req.requestId && req.startTime) {
    const responseTime = Date.now() - req.startTime;
    
    logger.error('Request error', {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      error: error.message,
      stack: error.stack,
      responseTime,
      userAgent: req.headers['user-agent'],
      ip: getClientIp(req)
    });
  }

  next(error);
};

/**
 * Performance monitoring middleware
 * Tracks request performance metrics
 */
export const PerformanceMonitor = (req: Request, res: Response, next: NextFunction): void => {
  req.startTime = Date.now();

  res.on('finish', () => {
    if (req.startTime) {
      const duration = Date.now() - req.startTime; // Duration in milliseconds
      
      logHelpers.logPerformance(`${req.method} ${req.route?.path || req.path}`, duration, {
        requestId: req.requestId,
        statusCode: res.statusCode,
        method: req.method,
        path: req.route?.path || req.path
      });
    }
  });

  next();
};