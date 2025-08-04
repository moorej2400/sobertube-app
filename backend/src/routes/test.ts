/**
 * Test Routes for Error Handling Validation
 * These routes are used only in test environment for validating error handling
 */

import { Router, Request, Response, NextFunction } from 'express';
import { 
  AppError, 
  ValidationError, 
  DatabaseError, 
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError 
} from '../utils/errors';
import { asyncErrorHandler } from '../middleware/errorHandler';

const router = Router();

// Only enable test routes in test environment
if (process.env['NODE_ENV'] === 'test') {
  
  // Test AppError
  router.get('/error/app', (_req: Request, _res: Response, next: NextFunction) => {
    next(new AppError('Test application error', 400));
  });

  // Test ValidationError
  router.get('/error/validation', (_req: Request, _res: Response, next: NextFunction) => {
    const details = [
      { field: 'email', message: 'Invalid email format' },
      { field: 'password', message: 'Password too short' }
    ];
    next(new ValidationError('Validation failed', details));
  });

  // Test DatabaseError
  router.get('/error/database', (_req: Request, _res: Response, next: NextFunction) => {
    next(new DatabaseError('Database connection failed', 'CONN_FAILED'));
  });

  // Test AuthenticationError  
  router.get('/error/auth', (_req: Request, _res: Response, next: NextFunction) => {
    next(new AuthenticationError('Invalid credentials'));
  });

  // Test AuthorizationError
  router.get('/error/authz', (_req: Request, _res: Response, next: NextFunction) => {
    next(new AuthorizationError('Access denied', 'admin:read', ['user:read']));
  });

  // Test NotFoundError
  router.get('/error/notfound', (_req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError('User not found', 'user', '123'));
  });

  // Test RateLimitError
  router.get('/error/ratelimit', (_req: Request, _res: Response, next: NextFunction) => {
    next(new RateLimitError('Too many requests', 60, 100, 60000));
  });

  // Test generic Error
  router.get('/error/generic', (_req: Request, _res: Response, next: NextFunction) => {
    next(new Error('Generic error message'));
  });

  // Test async error
  router.get('/error/async', asyncErrorHandler(async (_req: Request, _res: Response, _next: NextFunction) => {
    throw new Error('Async operation failed');
  }));

  // Test promise rejection
  router.get('/error/promise', (_req: Request, _res: Response, next: NextFunction) => {
    Promise.reject(new Error('Promise rejected')).catch(next);
  });

  // Test echo endpoint for request logging
  router.post('/echo', (req: Request, res: Response) => {
    res.json({
      success: true,
      received: req.body,
      timestamp: new Date().toISOString()
    });
  });

  // Test sensitive data endpoint for logging filtering
  router.post('/sensitive', (_req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Sensitive data received',
      timestamp: new Date().toISOString()
    });
  });
}

export default router;