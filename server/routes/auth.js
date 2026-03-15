import express from 'express';
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

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const newUser = new User({ username, email, password });

    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ message: 'Username/Email and password are required' });
    }

    const user = await User.findOne({ $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }] });
    if (!user) {
      return res.status(400).json({ message: 'Invalid username/password credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid username/password credentials' });
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

    return res.json({
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

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(401).json({ message: 'Refresh token is required' });
    }

    const incomingHash = hashToken(refreshToken);
    const storedToken = await RefreshToken.findOne({ tokenHash: incomingHash });

    if (!storedToken) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Theft detection: token was already used — invalidate entire family
    if (storedToken.used) {
      logger.warn(`Refresh token reuse detected for family ${storedToken.family}, user ${storedToken.userId}. Invalidating family.`);
      await RefreshToken.deleteMany({ family: storedToken.family });
      return res.status(401).json({ message: 'Refresh token reuse detected. Please log in again.' });
    }

    // Check expiration (don't rely solely on TTL index)
    if (storedToken.expiresAt < new Date()) {
      await RefreshToken.deleteOne({ _id: storedToken._id });
      return res.status(401).json({ message: 'Refresh token expired' });
    }

    // Mark current token as used
    storedToken.used = true;
    await storedToken.save();

    // Issue new token pair
    const newAccessToken = generateAccessToken(storedToken.userId.toString());
    const { rawToken: newRawToken, tokenHash: newHash } = generateRefreshToken();

    await RefreshToken.create({
      userId: storedToken.userId,
      tokenHash: newHash,
      family: storedToken.family,
      expiresAt: getRefreshTokenExpiresAt(),
    });

    return res.json({
      accessToken: newAccessToken,
      refreshToken: newRawToken,
    });
  } catch (error) {
    logger.error('Error refreshing token:', error);
    res.status(500).json({ message: 'Error refreshing token' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    const tokenHash = hashToken(refreshToken);
    const storedToken = await RefreshToken.findOne({ tokenHash });

    if (storedToken) {
      // Delete the entire token family to invalidate all rotated tokens in this session
      await RefreshToken.deleteMany({ family: storedToken.family });
    }

    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Error during logout:', error);
    res.status(500).json({ message: 'Error logging out' });
  }
});

router.get('/protected', authenticateToken, (req, res) => {
  res.json({ message: `Hello, user ${req.user.id}` });
});

export { router as authRoutes };
