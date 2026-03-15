import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import { authenticateToken } from '../middleware/authenticateToken.js';
import {
  generateAccessToken,
  generateRefreshToken,
  generateTokenFamily,
  getRefreshTokenExpiresAt,
  hashToken,
} from '../utils/tokenUtils.js';
import logger from '../config/logger.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from '../schemas/auth.schema.js';

const router = express.Router();

router.post('/register', validate({ body: registerSchema }), async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      res.status(400).json({ message: 'User already exists' });
      return;
    }
    const newUser = new User({ username, email, password });

    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'Username or email already exists' });
      return;
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/login', validate({ body: loginSchema }), async (req: Request, res: Response) => {
  try {
    const { usernameOrEmail, password } = req.body;

    const user = await User.findOne({ $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }] });
    if (!user) {
      res.status(400).json({ message: 'Invalid username/password credentials' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(400).json({ message: 'Invalid username/password credentials' });
      return;
    }

    const accessToken = generateAccessToken(user._id.toString());
    const { rawToken, tokenHash } = generateRefreshToken();
    const family = generateTokenFamily();

    await RefreshToken.create({
      userId: user._id,
      tokenHash,
      family,
      expiresAt: getRefreshTokenExpiresAt(),
    });

    res.json({
      accessToken,
      refreshToken: rawToken,
      userId: user._id.toString(),
      username: user.username,
    });
  } catch (error) {
    logger.error('Error during login:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

router.post('/refresh', validate({ body: refreshSchema }), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    const incomingHash = hashToken(refreshToken);
    const storedToken = await RefreshToken.findOne({ tokenHash: incomingHash });

    if (!storedToken) {
      res.status(401).json({ message: 'Invalid refresh token' });
      return;
    }

    if (storedToken.used) {
      logger.warn(`Refresh token reuse detected for family ${storedToken.family}, user ${storedToken.userId}. Invalidating family.`);
      await RefreshToken.deleteMany({ family: storedToken.family });
      res.status(401).json({ message: 'Refresh token reuse detected. Please log in again.' });
      return;
    }

    if (storedToken.expiresAt < new Date()) {
      await RefreshToken.deleteOne({ _id: storedToken._id });
      res.status(401).json({ message: 'Refresh token expired' });
      return;
    }

    storedToken.used = true;
    await storedToken.save();

    const newAccessToken = generateAccessToken(storedToken.userId.toString());
    const { rawToken: newRawToken, tokenHash: newHash } = generateRefreshToken();

    await RefreshToken.create({
      userId: storedToken.userId,
      tokenHash: newHash,
      family: storedToken.family,
      expiresAt: getRefreshTokenExpiresAt(),
    });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRawToken,
    });
  } catch (error) {
    logger.error('Error refreshing token:', error);
    res.status(500).json({ message: 'Error refreshing token' });
  }
});

router.post('/logout', validate({ body: logoutSchema }), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    const tokenHash = hashToken(refreshToken);
    const storedToken = await RefreshToken.findOne({ tokenHash });

    if (storedToken) {
      await RefreshToken.deleteMany({ family: storedToken.family });
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Error during logout:', error);
    res.status(500).json({ message: 'Error logging out' });
  }
});

router.get('/protected', authenticateToken, (req: Request, res: Response) => {
  res.json({ message: `Hello, user ${req.user!.id}` });
});

export { router as authRoutes };
