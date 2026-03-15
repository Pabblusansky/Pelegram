import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger.js';

export function sendError(res: Response, status: number, message: string): Response {
  return res.status(status).json({ message });
}

export function globalErrorHandler(err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction): void {
  logger.error('Unhandled error:', err);

  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message || 'Internal server error';

  res.status(status).json({ message });
}
