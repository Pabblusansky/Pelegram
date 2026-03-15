import jwt from 'jsonwebtoken';
import logger from '../config/logger.js';

export const authenticateToken = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next(); // Allow preflight requests to pass
  }

  if (!process.env.SECRET_KEY) {
      logger.error('AUTH_MIDDLEWARE: SECRET_KEY not found in process.env!');
      return res.status(500).json({ message: 'Server configuration error (secret missing in middleware)' });
  }
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'Access denied. No authorization header.' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.user = decoded; // Attach user data to the request object
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    logger.error('Invalid token:', error.message);
    return res.status(401).json({ message: 'Invalid token', code: 'TOKEN_INVALID' });
  }
};

export default authenticateToken;