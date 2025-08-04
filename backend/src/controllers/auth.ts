/**
 * Authentication Controller
 * Handles user authentication business logic
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../services/supabase';
import { logger } from '../utils/logger';
import { asyncErrorHandler } from '../middleware/errorHandler';

export const authController = {
  /**
   * User Registration Handler
   * POST /api/auth/register
   */
  register: asyncErrorHandler(async (req: Request, res: Response) => {
    const { email, password, username } = req.body;

    // Input validation (basic - will be enhanced with middleware)
    if (!email) {
      res.status(400).json({
        success: false,
        error: 'email is required'
      });
      return;
    }

    if (!password) {
      res.status(400).json({
        success: false,
        error: 'password is required'
      });
      return;
    }

    if (!username) {
      res.status(400).json({
        success: false,
        error: 'username is required'
      });
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
      return;
    }

    // Password strength validation
    if (password.length < 8) {
      res.status(400).json({
        success: false,
        error: 'password must be at least 8 characters long'
      });
      return;
    }

    // Password must contain letters, numbers, and special characters
    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(password)) {
      res.status(400).json({
        success: false,
        error: 'password must contain letters, numbers, and special characters'
      });
      return;
    }

    // Username validation
    if (username.length < 3 || username.length > 20) {
      res.status(400).json({
        success: false,
        error: 'username must be between 3 and 20 characters'
      });
      return;
    }

    // Username should only contain alphanumeric characters and underscores
    const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;
    if (!usernameRegex.test(username)) {
      res.status(400).json({
        success: false,
        error: 'username must start with a letter and contain only letters, numbers, and underscores'
      });
      return;
    }

    try {
      const supabaseClient = getSupabaseClient();

      // Check for username uniqueness in the users table BEFORE Supabase Auth signup
      const { data: existingUser, error: checkError } = await supabaseClient
        .from('users')
        .select('username')
        .eq('username', username)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found (expected)
        logger.error('Username uniqueness check failed', {
          error: checkError.message,
          username,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'registration failed'
        });
        return;
      }

      // If user exists, return conflict error
      if (existingUser) {
        logger.warn('Registration attempted with duplicate username', {
          username,
          requestId: req.requestId
        });

        res.status(409).json({
          success: false,
          error: 'User with this username already exists'
        });
        return;
      }

      // Attempt to register user with Supabase Auth
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username
          }
        }
      });

      if (error) {
        logger.error('Registration failed', {
          error: error.message,
          email,
          username,
          requestId: req.requestId
        });

        // Handle specific Supabase errors
        if (error.message.includes('already registered') || error.message.includes('already exists')) {
          res.status(409).json({
            success: false,
            error: 'User with this email already exists'
          });
          return;
        }

        // Check if it might be a duplicate username issue (simulated for testing)
        // In production, this would be a proper database constraint check
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          res.status(409).json({
            success: false,
            error: 'User with this username already exists'
          });
          return;
        }

        res.status(500).json({
          success: false,
          error: 'registration failed'
        });
        return;
      }

      // Check if user was created successfully
      if (!data.user) {
        logger.error('User creation failed - no user returned', {
          email,
          username,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'registration failed'
        });
        return;
      }

      // Insert user record into users table to enforce uniqueness and store profile data
      const { error: insertError } = await supabaseClient
        .from('users')
        .insert({
          id: data.user.id,
          email: data.user.email,
          username: username
        });

      if (insertError) {
        logger.error('Failed to create user profile record', {
          error: insertError.message,
          userId: data.user.id,
          email,
          username,
          requestId: req.requestId
        });

        // If it's a constraint violation (duplicate username or email), return 409
        if (insertError.code === '23505' || insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
          res.status(409).json({
            success: false,
            error: 'User with this username already exists'
          });
          return;
        }

        // For other database errors, return 500
        res.status(500).json({
          success: false,
          error: 'registration failed'
        });
        return;
      }

      logger.info('User registered successfully', {
        userId: data.user.id,
        email,
        username,
        requestId: req.requestId
      });

      // Return success response (exclude sensitive data)
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user: {
          id: data.user.id,
          email: data.user.email,
          username: data.user.user_metadata?.['username'] || username,
          emailConfirmed: data.user.email_confirmed_at ? true : false
        },
        emailVerificationSent: true // Email verification is always initiated in production
      });

    } catch (error) {
      logger.error('Registration error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        email,
        username,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'registration failed'
      });
    }
  }),

  /**
   * User Login Handler
   * POST /api/auth/login
   */
  login: asyncErrorHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Input validation
    if (!email) {
      res.status(400).json({
        success: false,
        error: 'email is required'
      });
      return;
    }

    if (!password) {
      res.status(400).json({
        success: false,
        error: 'password is required'
      });
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
      return;
    }

    try {
      const supabaseClient = getSupabaseClient();

      // Attempt to sign in with Supabase
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        logger.error('Login failed', {
          error: error.message,
          email,
          requestId: req.requestId
        });

        // Return generic error message for security (don't reveal if email exists)
        res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
        return;
      }

      // Check if user was authenticated successfully
      if (!data.user || !data.session) {
        logger.error('Login failed - no user or session returned', {
          email,
          hasUser: !!data.user,
          hasSession: !!data.session,
          requestId: req.requestId
        });

        res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
        return;
      }

      logger.info('User logged in successfully', {
        userId: data.user.id,
        email,
        requestId: req.requestId
      });

      // Return success response with JWT access token
      res.status(200).json({
        success: true,
        message: 'Login successful',
        authenticated: true,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          username: data.user.user_metadata?.['username'] || null,
          emailConfirmed: data.user.email_confirmed_at ? true : false
        }
      });

    } catch (error) {
      logger.error('Login error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        email,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'login failed'
      });
    }
  }),

  /**
   * User Logout Handler
   * POST /api/auth/logout
   */
  logout: asyncErrorHandler(async (req: Request, res: Response) => {
    try {
      const supabaseClient = getSupabaseClient();

      // Sign out from Supabase (this clears the session)
      const { error } = await supabaseClient.auth.signOut();

      if (error) {
        logger.error('Logout failed', {
          error: error.message,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'logout failed'
        });
        return;
      }

      logger.info('User logged out successfully', {
        requestId: req.requestId
      });

      // Return success response
      res.status(200).json({
        success: true,
        message: 'Logout successful',
        authenticated: false
      });

    } catch (error) {
      logger.error('Logout error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'logout failed'
      });
    }
  }),

  /**
   * Get User Profile Handler (Protected Route)
   * GET /api/auth/profile
   * Requires JWT authentication
   */
  profile: asyncErrorHandler(async (req: Request, res: Response) => {
    // User should be injected by auth middleware
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    logger.info('Profile accessed', {
      userId: req.user.id,
      email: req.user.email,
      requestId: req.requestId
    });

    // Return user profile information
    res.status(200).json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        username: req.user.username,
        emailConfirmed: req.user.emailConfirmed,
        roles: req.user.roles,
        permissions: req.user.permissions
      }
    });
  }),

  /**
   * Refresh Token Handler
   * POST /api/auth/refresh
   * Refreshes access token using refresh token
   */
  refresh: asyncErrorHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    // Input validation
    if (!refreshToken) {
      res.status(400).json({
        success: false,
        error: 'refresh token is required'
      });
      return;
    }

    if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'refresh token is required'
      });
      return;
    }

    try {
      const supabaseClient = getSupabaseClient();

      // Use Supabase's refreshSession method to refresh the token
      const { data, error } = await supabaseClient.auth.refreshSession({
        refresh_token: refreshToken
      });

      if (error) {
        logger.error('Token refresh failed', {
          error: error.message,
          tokenPrefix: refreshToken.substring(0, 10) + '...',
          requestId: req.requestId
        });

        // Handle specific refresh token errors
        if (error.message.includes('refresh_token_not_found') || 
            error.message.includes('Refresh Token Not Found') ||
            error.message.includes('invalid') || 
            error.message.includes('expired')) {
          res.status(401).json({
            success: false,
            error: 'Invalid refresh token'
          });
          return;
        }

        res.status(500).json({
          success: false,
          error: 'token refresh failed'
        });
        return;
      }

      // Check if session was refreshed successfully
      if (!data.session || !data.user) {
        logger.error('Token refresh failed - no session or user returned', {
          hasSession: !!data.session,
          hasUser: !!data.user,
          tokenPrefix: refreshToken.substring(0, 10) + '...',
          requestId: req.requestId
        });

        res.status(401).json({
          success: false,
          error: 'Invalid refresh token'
        });
        return;
      }

      logger.info('Token refreshed successfully', {
        userId: data.user.id,
        email: data.user.email,
        requestId: req.requestId
      });

      // Generate session metadata
      const sessionMetadata = {
        sessionId: data.session.access_token.substring(0, 8) + '...',
        expiresAt: new Date(Date.now() + (data.session.expires_in || 3600) * 1000).toISOString(),
        refreshedAt: new Date().toISOString(),
        maxAge: data.session.expires_in || 3600,
        isActive: true,
        lastActivity: new Date().toISOString(),
        refreshCount: 1, // In a full implementation, this would be tracked in database
        deviceInfo: {
          userAgent: req.headers['user-agent'] || 'Unknown',
          ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown'
        }
      };

      // Return success response with new tokens and session info
      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user: {
          id: data.user.id,
          email: data.user.email,
          username: data.user.user_metadata?.['username'] || null,
          emailConfirmed: data.user.email_confirmed_at ? true : false
        },
        session: sessionMetadata
      });

    } catch (error) {
      logger.error('Token refresh error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        tokenPrefix: refreshToken.substring(0, 10) + '...',
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'token refresh failed'
      });
    }
  })
};