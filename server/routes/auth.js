import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/authenticateToken.js';

const router = express.Router();
const SECRET_KEY = process.env.SECRET_KEY || 'default_secret';

// Регистрация
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    const newUser = new User({ username, email, password });

    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    if (error.code === 11000) { // Duplicate key error
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Вход
router.post('/login', async (req, res) => {
  try {
    console.log('Received login request:', req.body);  // Логируем полученные данные
    const { usernameOrEmail, password } = req.body;
    console.log('Password received from client:', password);
    const isPassword = await bcrypt.compare('123123', '$2a$10$C92TkfTMGvYvIwU1vK3VPeboywcy9Xe/Ny.tMJ.dHwtRqe5qcvknO');
    console.log('Password comparison result:', isPassword);

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: 'Username/Email and password are required' });
    }

    const user = await User.findOne({ $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }] });
    if (!user) {
      return res.status(400).json({ error: 'Invalid username credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log('Password stored in DB:', user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid password credentials' });
    }

    const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Error logging in' });
  }
});
router.get('/protected', authenticateToken, (req, res) => {
  res.json({ message: `Hello, user ${req.user.id}` });
});

export { router as authRoutes };
