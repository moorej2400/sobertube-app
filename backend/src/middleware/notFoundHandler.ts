/**
 * 404 Not Found Handler Middleware
 * Handles requests to non-existent routes
 */

import { Request, Response, NextFunction } from 'express';

export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  res.status(404).json({
    success: false,
    error: {
      message: error.message,
      path: req.originalUrl,
      method: req.method
    }
  });
};