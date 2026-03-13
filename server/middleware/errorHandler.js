import logger from '../config/logger.js';

/**
 * Send a standardized error response.
 * Use this in route handlers for consistent error formatting.
 *
 * @param {import('express').Response} res
 * @param {number} status - HTTP status code
 * @param {string} message - Human-readable error message
 */
export function sendError(res, status, message) {
  return res.status(status).json({ message });
}

/**
 * Express catch-all error middleware.
 * Must be registered AFTER all routes.
 */
export function globalErrorHandler(err, req, res, _next) {
  logger.error('Unhandled error:', err);

  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message || 'Internal server error';

  res.status(status).json({ message });
}
