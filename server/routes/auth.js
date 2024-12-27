import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const router = express.Router();
const SECRET_KEY = 'broskies';

// Регистрация
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const newUser = new User({ username, email, password });
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully', user: newUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Вход
router.post('/login', async (req, res) => {
  try {
    console.log('Login request body:', req.body); // Log the request body
    const { username, password } = req.body;
    if (!username || !password) {
      console.error('Username and password are required');
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const user = await User.findOne({ username });
    if (!user) {
      console.error('User not found');
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.error('Invalid credentials');
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Error during login:', error); // Log the error
    res.status(500).json({ error: 'Error logging in' });
  }
});

export { router as authRoutes };