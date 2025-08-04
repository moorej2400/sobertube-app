/**
 * Enhanced Global Error Handler Middleware
 * Handles all application errors with comprehensive logging and structured responses
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { 
  ValidationError, 
  DatabaseError, 
  AuthorizationError, 
  NotFoundError, 
  RateLimitError,
  ExternalServiceError,
  BusinessLogicError,
  isOperationalError 
} from '../utils/errors';

// Error statistics for monitoring
let errorStats = {
  total: 0,
  lastHour: [] as number[],
  last24Hours: [] as number[],
};

// Update error statistics
function updateErrorStats(): void {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const twentyFourHours = 24 * 60 * 60 * 1000;

  errorStats.total++;
  errorStats.lastHour.push(now);
  errorStats.last24Hours.push(now);

  // Clean old entries
  errorStats.lastHour = errorStats.lastHour.filter(time => now - time < oneHour);
  errorStats.last24Hours = errorStats.last24Hours.filter(time => now - time < twentyFourHours);
}

// Get current error rates
export function getErrorStats() {
  return {
    total: errorStats.total,
    lastHour: errorStats.lastHour.length,
    last24Hours: errorStats.last24Hours.length,
  };
}

/**
 * Format error response based on error type
 */
function formatErrorResponse(error: Error, requestId?: string) {
  const baseResponse = {
    success: false,
    error: {
      message: error.message,
      type: error.constructor.name,
      statusCode: (error as any).statusCode || 500,
      timestamp: new Date().toISOString(),
      ...(requestId && { requestId }),
    },
  };

  // Add specific properties based on error type
  if (error instanceof ValidationError) {
    (baseResponse.error as any).details = error.details;
  } else if (error instanceof DatabaseError) {
    (baseResponse.error as any).code = error.code;
  } else if (error instanceof AuthorizationError) {
    if (error.requiredPermission) {
      (baseResponse.error as any).requiredPermission = error.requiredPermission;
    }
  } else if (error instanceof NotFoundError) {
    if (error.resource) {
      (baseResponse.error as any).resource = error.resource;
      (baseResponse.error as any).resourceId = error.resourceId;
    }
  } else if (error instanceof RateLimitError) {
    (baseResponse.error as any).retryAfter = error.retryAfter;
    (baseResponse.error as any).limit = error.limit;
  } else if (error instanceof ExternalServiceError) {
    (baseResponse.error as any).service = error.service;
  } else if (error instanceof BusinessLogicError) {
    if (error.code) {
      (baseResponse.error as any).code = error.code;
      (baseResponse.error as any).context = error.context;
    }
  }

  // Add stack trace in development
  if (process.env['NODE_ENV'] === 'development') {
    (baseResponse.error as any).stack = error.stack;
  }

  return baseResponse;
}

/**
 * Enhanced error handler middleware
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Update error statistics
  updateErrorStats();

  const requestId = req.requestId;
  const isOperational = isOperationalError(err);
  const statusCode = (err as any).statusCode || 500;

  // Log error with appropriate level
  const logLevel = isOperational && statusCode < 500 ? 'warn' : 'error';
  const logMessage = isOperational ? 'Operational error occurred' : 'System error occurred';

  logger[logLevel](logMessage, {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode,
      isOperational,
    },
    request: {
      id: requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      userAgent: req.headers['user-agent'],
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    },
    timestamp: new Date().toISOString(),
  });

  // Set special headers for specific error types
  if (err instanceof RateLimitError) {
    res.setHeader('Retry-After', err.retryAfter);
    res.setHeader('X-RateLimit-Limit', err.limit);
    res.setHeader('X-RateLimit-Window', err.windowMs);
  }

  // Send error response
  const errorResponse = formatErrorResponse(err, requestId);
  res.status(statusCode).json(errorResponse);

  // For non-operational errors in production, notify monitoring service
  if (!isOperational && process.env['NODE_ENV'] === 'production') {
    // Here you would integrate with monitoring services like Sentry, DataDog, etc.
    logger.error('Critical system error - alerting required', {
      error: err.message,
      stack: err.stack,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch and forward errors
 */
export const asyncErrorHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Unhandled rejection handler
 */
export const handleUnhandledRejection = (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString(),
    timestamp: new Date().toISOString(),
  });

  // In production, you might want to exit the process
  if (process.env['NODE_ENV'] === 'production') {
    process.exit(1);
  }
};

/**
 * Uncaught exception handler
 */
export const handleUncaughtException = (error: Error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });

  // Exit the process - uncaught exceptions should not be ignored
  process.exit(1);
};

/**
 * Graceful shutdown handler
 */
export const gracefulShutdown = (signal: string) => {
  logger.info('Graceful shutdown initiated', {
    signal,
    timestamp: new Date().toISOString(),
  });

  // Close server gracefully
  // This would be implemented in the main server file
  process.exit(0);
};