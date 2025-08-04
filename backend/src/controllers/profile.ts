/**
 * Profile Controller
 * Handles user profile management business logic
 */

import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { asyncErrorHandler } from '../middleware/errorHandler';
import Joi from 'joi';

// Profile validation schemas
const createProfileSchema = Joi.object({
  username: Joi.string()
    .min(3)
    .max(20)
    .pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/)
    .required()
    .messages({
      'string.pattern.base': 'Username must start with a letter and contain only letters, numbers, and underscores',
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username must be at most 20 characters long'
    }),
  display_name: Joi.string().max(100).allow(null, ''),
  bio: Joi.string().max(500).allow(null, ''),
  location: Joi.string().max(100).allow(null, ''),
  sobriety_date: Joi.date().iso().allow(null, ''),
  profile_picture_url: Joi.string().uri().allow(null, ''),
  privacy_level: Joi.string().valid('public', 'friends', 'private').default('public')
});

const updateProfileSchema = Joi.object({
  username: Joi.string()
    .min(3)
    .max(20)
    .pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/)
    .messages({
      'string.pattern.base': 'Username must start with a letter and contain only letters, numbers, and underscores',
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username must be at most 20 characters long'
    }),
  display_name: Joi.string().max(100).allow(null, ''),
  bio: Joi.string().max(500).allow(null, ''),
  location: Joi.string().max(100).allow(null, ''),
  sobriety_date: Joi.date().iso().allow(null, ''),
  profile_picture_url: Joi.string().uri().allow(null, ''),
  privacy_level: Joi.string().valid('public', 'friends', 'private')
});

// UUID validation schema
const uuidSchema = Joi.string().uuid({ version: 'uuidv4' });

// Get service role client for bypassing RLS when needed
function getServiceRoleClient() {
  return createClient(
    process.env['SUPABASE_URL'] || 'http://127.0.0.1:54321',
    process.env['SUPABASE_SERVICE_ROLE_KEY'] || ''
  );
}

// Simple input sanitization function
function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove potentially dangerous HTML tags and scripts
    return input
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .trim();
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  return input;
}

export const profileController = {
  /**
   * Create Profile Handler
   * POST /api/profiles
   */
  create: asyncErrorHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    // Sanitize and validate input data
    const sanitizedBody = sanitizeInput(req.body);
    const { error: validationError, value: profileData } = createProfileSchema.validate(sanitizedBody);
    if (validationError) {
      res.status(400).json({
        success: false,
        error: validationError.details[0].message
      });
      return;
    }

    try {
      const supabaseClient = getServiceRoleClient();

      // Check if user already has a profile
      const { data: existingProfile } = await supabaseClient
        .from('users')
        .select('id')
        .eq('id', req.user.id)
        .single();

      if (existingProfile) {
        res.status(409).json({
          success: false,
          error: 'User already has a profile'
        });
        return;
      }

      // Create profile with authenticated user's ID
      const { data: profile, error } = await supabaseClient
        .from('users')
        .insert({
          id: req.user.id,
          email: req.user.email,
          ...profileData
        })
        .select()
        .single();

      if (error) {
        logger.error('Profile creation failed', {
          error: error.message,
          userId: req.user.id,
          requestId: req.requestId
        });

        // Handle duplicate username error
        if (error.message.includes('duplicate') && error.message.includes('username')) {
          res.status(409).json({
            success: false,
            error: 'Username already exists'
          });
          return;
        }

        res.status(500).json({
          success: false,
          error: 'Profile creation failed'
        });
        return;
      }

      logger.info('Profile created successfully', {
        userId: req.user.id,
        username: profile.username,
        requestId: req.requestId
      });

      // Remove sensitive data from response
      const { email, ...publicProfile } = profile;

      res.status(201).json({
        success: true,
        message: 'Profile created successfully',
        profile: publicProfile
      });

    } catch (error) {
      logger.error('Profile creation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId: req.user.id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'Profile creation failed'
      });
    }
  }),

  /**
   * Get Profile by ID Handler
   * GET /api/profiles/:id
   */
  getById: asyncErrorHandler(async (req: Request, res: Response) => {
    const profileId = req.params['id'];

    // Validate UUID format
    const { error: uuidError } = uuidSchema.validate(profileId);
    if (uuidError) {
      res.status(400).json({
        success: false,
        error: 'Invalid profile ID format'
      });
      return;
    }

    try {
      const supabaseClient = getServiceRoleClient();

      // Get profile with privacy filtering
      const { data: profile, error } = await supabaseClient
        .from('users')
        .select('id, username, display_name, bio, location, sobriety_date, profile_picture_url, privacy_level, created_at, updated_at')
        .eq('id', profileId)
        .single();

      if (error || !profile) {
        logger.info('Profile not found', {
          profileId,
          requestId: req.requestId
        });

        res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
        return;
      }

      // Check privacy settings
      if (profile.privacy_level === 'private' && (!req.user || req.user.id !== profile.id)) {
        res.status(403).json({
          success: false,
          error: 'This profile is private'
        });
        return;
      }

      // For friends privacy level, check if users are friends (not implemented yet)
      if (profile.privacy_level === 'friends' && (!req.user || req.user.id !== profile.id)) {
        // TODO: Implement friend check logic
        res.status(403).json({
          success: false,
          error: 'This profile is only visible to friends'
        });
        return;
      }

      logger.info('Profile retrieved successfully', {
        profileId,
        viewerId: req.user?.id || 'anonymous',
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        profile
      });

    } catch (error) {
      logger.error('Get profile error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        profileId,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve profile'
      });
    }
  }),

  /**
   * Get Current User Profile Handler
   * GET /api/profiles/me
   */
  getMe: asyncErrorHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    try {
      const supabaseClient = getServiceRoleClient();

      // Get current user's profile with all fields (including email)
      const { data: profile, error } = await supabaseClient
        .from('users')
        .select('*')
        .eq('id', req.user.id)
        .single();

      if (error || !profile) {
        logger.info('User profile not found', {
          userId: req.user.id,
          requestId: req.requestId
        });

        res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
        return;
      }

      logger.info('User profile retrieved successfully', {
        userId: req.user.id,
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        profile
      });

    } catch (error) {
      logger.error('Get current user profile error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId: req.user.id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve profile'
      });
    }
  }),

  /**
   * Update Current User Profile Handler
   * PUT /api/profiles/me
   */
  updateMe: asyncErrorHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    // Sanitize and validate input data
    const sanitizedBody = sanitizeInput(req.body);
    const { error: validationError, value: updateData } = updateProfileSchema.validate(sanitizedBody);
    if (validationError) {
      res.status(400).json({
        success: false,
        error: validationError.details[0].message
      });
      return;
    }

    try {
      const supabaseClient = getServiceRoleClient();

      // Check if profile exists
      const { data: existingProfile } = await supabaseClient
        .from('users')
        .select('id')
        .eq('id', req.user.id)
        .single();

      if (!existingProfile) {
        res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
        return;
      }

      // Update profile
      const { data: profile, error } = await supabaseClient
        .from('users')
        .update(updateData)
        .eq('id', req.user.id)
        .select()
        .single();

      if (error) {
        logger.error('Profile update failed', {
          error: error.message,
          userId: req.user.id,
          requestId: req.requestId
        });

        // Handle duplicate username error
        if (error.message.includes('duplicate') && error.message.includes('username')) {
          res.status(409).json({
            success: false,
            error: 'Username already exists'
          });
          return;
        }

        res.status(500).json({
          success: false,
          error: 'Profile update failed'
        });
        return;
      }

      logger.info('Profile updated successfully', {
        userId: req.user.id,
        updatedFields: Object.keys(updateData),
        requestId: req.requestId
      });

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        profile
      });

    } catch (error) {
      logger.error('Profile update error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId: req.user.id,
        requestId: req.requestId
      });

      res.status(500).json({
        success: false,
        error: 'Profile update failed'
      });
    }
  })
};