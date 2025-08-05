/**
 * Enhanced WebSocket Authentication Middleware
 * JWT authentication with session management and reconnection support
 */

import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { config } from '../config';
import { SocketErrorPayload } from './types';

export interface AuthResult {
  success: boolean;
  userId?: string;
  username?: string;
  error?: string;
}

export interface TokenPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}

export class WebSocketAuthMiddleware {
  private readonly jwtSecret: string;
  private tokenBlacklist: Set<string> = new Set();
  
  // Rate limiting for authentication attempts
  private authAttempts: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly MAX_AUTH_ATTEMPTS = 5;
  private readonly AUTH_WINDOW_MS = 60000; // 1 minute

  constructor() {
    this.jwtSecret = config.jwtSecret;
    
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required for WebSocket authentication');
    }
    
    logger.info('WebSocket Auth Middleware initialized', {
      component: 'WebSocketAuthMiddleware',
      maxAuthAttempts: this.MAX_AUTH_ATTEMPTS,
      authWindowMs: this.AUTH_WINDOW_MS
    });
  }

  /**
   * Authenticate socket connection using JWT token
   */
  public async authenticateSocket(socket: any): Promise<AuthResult> {
    const startTime = Date.now();
    const clientIp = this.getClientIp(socket);
    
    try {
      // Check rate limiting
      if (!this.checkAuthRateLimit(clientIp)) {
        const error = 'Too many authentication attempts. Please try again later.';
        logger.warn('Authentication rate limit exceeded', {
          component: 'WebSocketAuthMiddleware',
          socketId: socket.id,
          clientIp,
          attempts: this.authAttempts.get(clientIp)?.count
        });
        
        return { success: false, error };
      }

      // Extract token from various sources
      const token = this.extractToken(socket);
      
      if (!token) {
        this.recordAuthAttempt(clientIp, false);
        return { success: false, error: 'No authentication token provided' };
      }

      // Check token blacklist
      if (this.tokenBlacklist.has(token)) {
        this.recordAuthAttempt(clientIp, false);
        logger.warn('Blacklisted token used', {
          component: 'WebSocketAuthMiddleware',
          socketId: socket.id,
          clientIp
        });
        return { success: false, error: 'Token has been revoked' };
      }

      // Verify JWT token
      const authResult = await this.verifyToken(token);
      
      if (!authResult.success) {
        this.recordAuthAttempt(clientIp, false);
        return authResult;
      }

      // Authentication successful
      this.recordAuthAttempt(clientIp, true);
      
      const authTime = Date.now() - startTime;
      logger.info('Socket authentication successful', {
        component: 'WebSocketAuthMiddleware',
        socketId: socket.id,
        userId: authResult.userId,
        username: authResult.username,
        clientIp,
        authTime
      });

      return authResult;

    } catch (error) {
      this.recordAuthAttempt(clientIp, false);
      
      const authTime = Date.now() - startTime;
      logger.error('Socket authentication error', {
        component: 'WebSocketAuthMiddleware',
        socketId: socket.id,
        clientIp,
        error: error instanceof Error ? error.message : 'Unknown error',
        authTime
      });

      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Authentication failed' 
      };
    }
  }

  /**
   * Extract JWT token from socket handshake
   */
  private extractToken(socket: any): string | null {
    // Try multiple sources for the token
    const sources = [
      // Auth object in handshake
      socket.handshake.auth?.token,
      // Authorization header
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, ''),
      // Query parameter
      socket.handshake.query?.token,
      // Cookie (if using cookie-based auth)
      this.extractTokenFromCookie(socket.handshake.headers?.cookie)
    ];

    for (const token of sources) {
      if (token && typeof token === 'string' && token.trim()) {
        return token.trim();
      }
    }

    return null;
  }

  /**
   * Extract token from cookie string
   */
  private extractTokenFromCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>);

    return cookies['auth_token'] || cookies['jwt'] || null;
  }

  /**
   * Verify JWT token and extract payload
   */
  private async verifyToken(token: string): Promise<AuthResult> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload;
      
      // Validate required fields
      if (!decoded.userId || !decoded.username) {
        return { 
          success: false, 
          error: 'Invalid token payload: missing required fields' 
        };
      }

      // Check token expiration (additional check beyond jwt.verify)
      if (decoded.exp && decoded.exp * 1000 < Date.now()) {
        return { 
          success: false, 
          error: 'Token has expired' 
        };
      }

      return {
        success: true,
        userId: decoded.userId,
        username: decoded.username
      };

    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return { success: false, error: 'Token has expired' };
      } else if (error instanceof jwt.JsonWebTokenError) {
        return { success: false, error: 'Invalid token format' };
      } else {
        return { success: false, error: 'Token verification failed' };
      }
    }
  }

  /**
   * Get client IP address from socket
   */
  private getClientIp(socket: any): string {
    return socket.handshake.address || 
           socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           socket.conn.remoteAddress ||
           'unknown';
  }

  /**
   * Check authentication rate limiting
   */
  private checkAuthRateLimit(clientIp: string): boolean {
    const now = Date.now();
    const attempt = this.authAttempts.get(clientIp);
    
    if (!attempt || now > attempt.resetTime) {
      return true; // No previous attempts or window expired
    }
    
    return attempt.count < this.MAX_AUTH_ATTEMPTS;
  }

  /**
   * Record authentication attempt
   */
  private recordAuthAttempt(clientIp: string, success: boolean): void {
    const now = Date.now();
    const attempt = this.authAttempts.get(clientIp);
    
    if (!attempt || now > attempt.resetTime) {
      // New window
      this.authAttempts.set(clientIp, {
        count: success ? 0 : 1,
        resetTime: now + this.AUTH_WINDOW_MS
      });
    } else {
      // Increment existing window (only for failures)
      if (!success) {
        attempt.count++;
      }
    }
    
    // Cleanup old entries periodically
    if (Math.random() < 0.01) { // 1% chance on each call
      this.cleanupRateLimitEntries();
    }
  }

  /**
   * Clean up expired rate limit entries
   */
  private cleanupRateLimitEntries(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [ip, attempt] of this.authAttempts) {
      if (now > attempt.resetTime) {
        this.authAttempts.delete(ip);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug('Cleaned up rate limit entries', {
        component: 'WebSocketAuthMiddleware',
        cleaned,
        remaining: this.authAttempts.size
      });
    }
  }

  /**
   * Blacklist a token (for logout/revocation)
   */
  public blacklistToken(token: string): void {
    this.tokenBlacklist.add(token);
    
    logger.info('Token blacklisted', {
      component: 'WebSocketAuthMiddleware',
      tokenPrefix: token.substring(0, 10) + '...',
      blacklistSize: this.tokenBlacklist.size
    });
    
    // Cleanup old blacklisted tokens periodically
    if (this.tokenBlacklist.size > 1000) {
      this.cleanupTokenBlacklist();
    }
  }

  /**
   * Clean up token blacklist (remove expired tokens)
   */
  private cleanupTokenBlacklist(): void {
    let cleaned = 0;
    const tokensToRemove: string[] = [];
    
    for (const token of this.tokenBlacklist) {
      try {
        const decoded = jwt.decode(token) as TokenPayload;
        if (decoded?.exp && decoded.exp * 1000 < Date.now()) {
          tokensToRemove.push(token);
          cleaned++;
        }
      } catch {
        // Invalid token, remove it
        tokensToRemove.push(token);
        cleaned++;
      }
    }
    
    tokensToRemove.forEach(token => this.tokenBlacklist.delete(token));
    
    logger.info('Token blacklist cleanup completed', {
      component: 'WebSocketAuthMiddleware',
      cleaned,
      remaining: this.tokenBlacklist.size
    });
  }

  /**
   * Get authentication statistics
   */
  public getAuthStats() {
    return {
      blacklistedTokens: this.tokenBlacklist.size,
      rateLimitEntries: this.authAttempts.size,
      maxAuthAttempts: this.MAX_AUTH_ATTEMPTS,
      authWindowMs: this.AUTH_WINDOW_MS
    };
  }

  /**
   * Clear all blacklisted tokens (admin function)
   */
  public clearTokenBlacklist(): void {
    const count = this.tokenBlacklist.size;
    this.tokenBlacklist.clear();
    
    logger.info('Token blacklist cleared', {
      component: 'WebSocketAuthMiddleware',
      clearedTokens: count
    });
  }

  /**
   * Create Socket.IO middleware function
   */
  public createMiddleware() {
    return async (socket: any, next: any) => {
      const authResult = await this.authenticateSocket(socket);
      
      if (authResult.success) {
        // Set authentication properties on socket
        socket.userId = authResult.userId;
        socket.username = authResult.username;
        socket.isAuthenticated = true;
        
        next();
      } else {
        // Authentication failed - emit error and allow connection with limited access
        socket.isAuthenticated = false;
        
        const error: SocketErrorPayload = {
          code: 'AUTH_FAILED',
          message: authResult.error || 'Authentication failed'
        };
        
        // Don't block connection, but mark as unauthenticated
        // This allows for graceful degradation and re-authentication
        next();
        
        // Emit authentication failure after connection is established
        process.nextTick(() => {
          socket.emit('unauthenticated', { reason: error.message });
        });
      }
    };
  }
}