/**
 * Structured Logging System
 * Winston-based logger with environment-specific configuration
 */

import winston from 'winston';
import { config } from '../config';

// Custom log levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
  },
};

// Add colors to winston
winston.addColors(customLevels.colors);

// Custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    
    const logEntry: any = {
      timestamp,
      level,
      message,
    };
    
    if (stack) {
      logEntry.stack = stack;
    }
    
    if (Object.keys(meta).length > 0) {
      logEntry.meta = meta;
    }

    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    
    let logMessage = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      logMessage += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    return logMessage;
  })
);

// Determine log level based on environment
const getLogLevel = (): string => {
  switch (config.nodeEnv) {
    case 'development':
      return 'debug';
    case 'test':
      return 'warn';
    case 'production':
      return 'info';
    default:
      return 'info';
  }
};

// Create transports array
const transports: winston.transport[] = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    format: config.nodeEnv === 'production' ? logFormat : consoleFormat,
  })
);

// File transports for production
if (config.nodeEnv === 'production') {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create the logger
export const logger = winston.createLogger({
  level: getLogLevel(),
  levels: customLevels.levels,
  format: logFormat,
  transports,
  exitOnError: false,
});

// Stream for HTTP request logging
export const logStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

/**
 * Structured logging helpers
 */
export const logHelpers = {
  /**
   * Log request information
   */
  logRequest: (requestId: string, method: string, url: string, meta?: Record<string, any>) => {
    logger.info('Request received', {
      requestId,
      method,
      url,
      ...meta,
    });
  },

  /**
   * Log response information
   */
  logResponse: (requestId: string, statusCode: number, responseTime: number, meta?: Record<string, any>) => {
    const level = statusCode >= 400 ? 'error' : 'info';
    logger.log(level, 'Request completed', {
      requestId,
      statusCode,
      responseTime,
      ...meta,
    });
  },

  /**
   * Log database operations
   */
  logDatabaseOperation: (operation: string, table: string, duration: number, success: boolean, meta?: Record<string, any>) => {
    logger.info('Database operation', {
      operation,
      table,
      duration,
      success,
      ...meta,
    });
  },

  /**
   * Log external service calls
   */
  logExternalService: (service: string, operation: string, duration: number, success: boolean, meta?: Record<string, any>) => {
    logger.info('External service call', {
      service,
      operation,
      duration,
      success,
      ...meta,
    });
  },

  /**
   * Log performance metrics
   */
  logPerformance: (operation: string, duration: number, meta?: Record<string, any>) => {
    const level = duration > 1000 ? 'warn' : 'info'; // Warn if operation takes > 1 second
    logger.log(level, 'Performance metric', {
      operation,
      duration,
      ...meta,
    });
  },

  /**
   * Log security events
   */
  logSecurity: (event: string, severity: 'low' | 'medium' | 'high', meta?: Record<string, any>) => {
    const level = severity === 'high' ? 'error' : severity === 'medium' ? 'warn' : 'info';
    logger.log(level, 'Security event', {
      event,
      severity,
      ...meta,
    });
  },

  /**
   * Log business events
   */
  logBusinessEvent: (event: string, meta?: Record<string, any>) => {
    logger.info('Business event', {
      event,
      ...meta,
    });
  },
};

// Log uncaught exceptions and unhandled rejections
if (config.nodeEnv === 'production') {
  logger.exceptions.handle(
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  );

  logger.rejections.handle(
    new winston.transports.File({ filename: 'logs/rejections.log' })
  );
}

// Export default logger
export default logger;