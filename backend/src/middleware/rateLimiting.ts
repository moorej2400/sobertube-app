/**
 * Rate Limiting Middleware Configuration
 * Configures rate limits for different endpoints
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate limiting for user registration
 * 5 attempts per 15 minutes per IP
 */
export const registrationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env['NODE_ENV'] === 'test' ? 50 : 5, // More lenient in test mode
  message: {
    success: false,
    error: 'Too many registration attempts, please try again later'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many registration attempts, please try again later'
    });
  }
});

/**
 * Rate limiting for user login
 * 10 attempts per 15 minutes per IP
 */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env['NODE_ENV'] === 'test' ? 100 : 10, // More lenient in test mode
  message: {
    success: false,
    error: 'Too many login attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many login attempts, please try again later'
    });
  }
});

/**
 * General API rate limiting
 * 100 requests per 15 minutes per IP
 */
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later'
    });
  }
});