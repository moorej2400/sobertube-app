/**
 * Custom Error Classes
 * Provides specific error types for different application scenarios
 */

/**
 * Base application error class
 * All custom errors should extend from this class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly timestamp: string;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error for request data validation failures
 */
export class ValidationError extends AppError {
  public readonly details: Array<{
    field: string;
    message: string;
    value?: any;
  }>;

  constructor(
    message: string = 'Validation failed',
    details: Array<{ field: string; message: string; value?: any }> = []
  ) {
    super(message, 400);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Database operation error
 */
export class DatabaseError extends AppError {
  public readonly code?: string;
  public readonly query?: string;

  constructor(
    message: string,
    code?: string,
    query?: string
  ) {
    super(message, 500);
    this.name = 'DatabaseError';
    if (code !== undefined) this.code = code;
    if (query !== undefined) this.query = query;
  }
}

/**
 * Authentication error for invalid credentials or missing auth
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error for insufficient permissions
 */
export class AuthorizationError extends AppError {
  public readonly requiredPermission?: string;
  public readonly userPermissions?: string[];

  constructor(
    message: string = 'Access denied',
    requiredPermission?: string,
    userPermissions?: string[]
  ) {
    super(message, 403);
    this.name = 'AuthorizationError';
    if (requiredPermission !== undefined) this.requiredPermission = requiredPermission;
    if (userPermissions !== undefined) this.userPermissions = userPermissions;
  }
}

/**
 * Not found error for missing resources
 */
export class NotFoundError extends AppError {
  public readonly resource?: string;
  public readonly resourceId?: string;

  constructor(
    message: string = 'Resource not found',
    resource?: string,
    resourceId?: string
  ) {
    super(message, 404);
    this.name = 'NotFoundError';
    if (resource !== undefined) this.resource = resource;
    if (resourceId !== undefined) this.resourceId = resourceId;
  }
}

/**
 * Rate limiting error
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;
  public readonly limit: number;
  public readonly windowMs: number;

  constructor(
    message: string = 'Too many requests',
    retryAfter: number = 60,
    limit: number = 100,
    windowMs: number = 60000
  ) {
    super(message, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.windowMs = windowMs;
  }
}

/**
 * External service error
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;
  public readonly originalError?: Error;

  constructor(
    message: string,
    service: string,
    originalError?: Error
  ) {
    super(message, 502);
    this.name = 'ExternalServiceError';
    this.service = service;
    if (originalError !== undefined) this.originalError = originalError;
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends AppError {
  public readonly configKey?: string;

  constructor(
    message: string,
    configKey?: string
  ) {
    super(message, 500, false); // Non-operational as it's a system issue
    this.name = 'ConfigurationError';
    if (configKey !== undefined) this.configKey = configKey;
  }
}

/**
 * Business logic error
 */
export class BusinessLogicError extends AppError {
  public readonly code?: string;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    code?: string,
    context?: Record<string, any>
  ) {
    super(message, 422);
    this.name = 'BusinessLogicError';
    if (code !== undefined) this.code = code;
    if (context !== undefined) this.context = context;
  }
}

/**
 * Type guard to check if error is operational
 */
export function isOperationalError(error: Error): error is AppError {
  return error instanceof AppError && error.isOperational;
}

/**
 * Error factory for creating specific error types
 */
export const createError = {
  validation: (message: string, details?: Array<{ field: string; message: string; value?: any }>) =>
    new ValidationError(message, details),
  
  database: (message: string, code?: string, query?: string) =>
    new DatabaseError(message, code, query),
  
  authentication: (message?: string) =>
    new AuthenticationError(message),
  
  authorization: (message?: string, requiredPermission?: string, userPermissions?: string[]) =>
    new AuthorizationError(message, requiredPermission, userPermissions),
  
  notFound: (message?: string, resource?: string, resourceId?: string) =>
    new NotFoundError(message, resource, resourceId),
  
  rateLimit: (message?: string, retryAfter?: number, limit?: number, windowMs?: number) =>
    new RateLimitError(message, retryAfter, limit, windowMs),
  
  externalService: (message: string, service: string, originalError?: Error) =>
    new ExternalServiceError(message, service, originalError),
  
  configuration: (message: string, configKey?: string) =>
    new ConfigurationError(message, configKey),
  
  businessLogic: (message: string, code?: string, context?: Record<string, any>) =>
    new BusinessLogicError(message, code, context)
};