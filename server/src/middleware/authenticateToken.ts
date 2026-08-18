import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import logger from '../config/logger.js';

export interface AuthUser {
  id: string;
}

/**
 * The single algorithm this server signs with. Passing it to verify() pins the
 * accepted `alg` instead of letting the token header pick from every HMAC
 * variant jsonwebtoken enables by default.
 */
export const JWT_ALGORITHMS = ['HS256'] as const;

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    res.status(401).json({ message: 'Access denied. No authorization header.' });
    return;
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    res.status(401).json({ message: 'Access denied. No token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.SECRET_KEY, {
      algorithms: [...JWT_ALGORITHMS],
    }) as AuthUser;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
      return;
    }
    logger.error('Invalid token:', (error as Error).message);
    res.status(401).json({ message: 'Invalid token', code: 'TOKEN_INVALID' });
  }
};

export default authenticateToken;
