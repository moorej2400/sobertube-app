/**
 * JWT Authentication Middleware
 * Handles JWT token extraction, validation, and user context injection
 */

import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../services/supabase';
import { logger } from '../utils/logger';

// Extend Request interface to include user context
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        username?: string;
        roles?: string[];
        permissions?: string[];
        emailConfirmed: boolean;
      };
    }
  }
}

/**
 * Extract JWT token from Authorization header
 */
function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  // Check if header follows Bearer token format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Validate JWT token with Supabase and get user information
 */
async function validateTokenWithSupabase(token: string) {
  const supabaseClient = getSupabaseClient();

  try {
    // Verify the JWT token with Supabase
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (error) {
      logger.warn('JWT token validation failed', {
        error: error.message,
        tokenPrefix: token.substring(0, 10) + '...'  // Log only prefix for security
      });
      return null;
    }

    if (!user) {
      logger.warn('JWT token valid but no user found', {
        tokenPrefix: token.substring(0, 10) + '...'
      });
      return null;
    }

    return user;
  } catch (error) {
    logger.error('JWT validation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      tokenPrefix: token.substring(0, 10) + '...'
    });
    throw error;
  }
}

/**
 * JWT Authentication Middleware
 * Validates JWT tokens and injects user context into request
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    // Check if Authorization header exists
    if (!authHeader) {
      logger.warn('Authentication attempt without token', {
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        path: req.path,
        requestId: req.requestId
      });

      res.status(401)
        .set('WWW-Authenticate', 'Bearer')
        .json({
          success: false,
          error: 'No authorization token provided'
        });
      return;
    }

    // Check for malformed Authorization header
    if (!authHeader.startsWith('Bearer ')) {
      logger.warn('Malformed Authorization header', {
        authHeader: authHeader ? authHeader.substring(0, 20) + '...' : 'undefined',
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        requestId: req.requestId
      });

      res.status(401)
        .set('WWW-Authenticate', 'Bearer')
        .json({
          success: false,
          error: 'Invalid authorization header format'
        });
      return;
    }

    const token = extractTokenFromHeader(authHeader);

    // Check if token exists after extraction
    if (!token) {
      logger.warn('Authentication attempt with empty token', {
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        path: req.path,
        requestId: req.requestId
      });

      res.status(401)
        .set('WWW-Authenticate', 'Bearer')
        .json({
          success: false,
          error: 'No authorization token provided'
        });
      return;
    }

    // Validate token with Supabase
    const user = await validateTokenWithSupabase(token);

    if (!user) {
      logger.warn('Authentication failed - invalid or expired token', {
        tokenPrefix: token.substring(0, 10) + '...',
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        requestId: req.requestId
      });

      res.status(401)
        .set('WWW-Authenticate', 'Bearer')
        .json({
          success: false,
          error: 'Invalid or expired token'
        });
      return;
    }

    // Inject user context into request
    req.user = {
      id: user.id,
      email: user.email || '',
      username: user.user_metadata?.['username'] || null,
      emailConfirmed: user.email_confirmed_at ? true : false,
      roles: user.user_metadata?.['roles'] || ['user'], // Default role
      permissions: user.user_metadata?.['permissions'] || ['read'] // Default permissions
    };

    logger.info('User authenticated successfully', {
      userId: user.id,
      email: user.email,
      path: req.path,
      requestId: req.requestId
    });

    next();

  } catch (error) {
    logger.error('Authentication middleware error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      path: req.path,
      requestId: req.requestId
    });

    res.status(500).json({
      success: false,
      error: 'Authentication service unavailable'
    });
  }
};

/**
 * Optional JWT Authentication Middleware
 * Validates JWT tokens if present, but allows requests without tokens
 */
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    // If no token, continue without authentication
    if (!token) {
      next();
      return;
    }

    // If token exists, validate it
    const user = await validateTokenWithSupabase(token);

    if (user) {
      // Inject user context into request if valid
      req.user = {
        id: user.id,
        email: user.email || '',
        username: user.user_metadata?.['username'] || null,
        emailConfirmed: user.email_confirmed_at ? true : false,
        roles: user.user_metadata?.['roles'] || ['user'],
        permissions: user.user_metadata?.['permissions'] || ['read']
      };

      logger.info('Optional authentication successful', {
        userId: user.id,
        email: user.email,
        path: req.path,
        requestId: req.requestId
      });
    } else {
      logger.warn('Optional authentication failed - invalid token', {
        tokenPrefix: token.substring(0, 10) + '...',
        path: req.path,
        requestId: req.requestId
      });
    }

    next();

  } catch (error) {
    logger.error('Optional authentication middleware error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      requestId: req.requestId
    });

    // Continue without authentication on error
    next();
  }
};

/**
 * Role-based authorization middleware
 * Requires specific roles for access
 */
export const requireRole = (requiredRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const userRoles = req.user.roles || [];
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      logger.warn('Authorization failed - insufficient roles', {
        userId: req.user.id,
        userRoles,
        requiredRoles,
        path: req.path,
        requestId: req.requestId
      });

      res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
};

/**
 * Permission-based authorization middleware
 * Requires specific permissions for access
 */
export const requirePermission = (requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const userPermissions = req.user.permissions || [];
    const hasRequiredPermission = requiredPermissions.some(permission => 
      userPermissions.includes(permission)
    );

    if (!hasRequiredPermission) {
      logger.warn('Authorization failed - insufficient permissions', {
        userId: req.user.id,
        userPermissions,
        requiredPermissions,
        path: req.path,
        requestId: req.requestId
      });

      res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
};

/**
 * Alias for requireAuth to maintain compatibility with existing routes
 */
export const authenticateToken = requireAuth;