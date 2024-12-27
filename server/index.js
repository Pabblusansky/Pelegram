import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import User from './models/User.js';
import { authRoutes } from './routes/auth.js'; // Import named export

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Conectare MongoDB
mongoose.connect('mongodb://localhost:27017/Pelegram', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Ruta pentru a obține utilizatorii
app.get('/users', async (_req, res) => {
  try {
    const users = await User.find(); // Extragem toți utilizatorii din colecție
    res.json(users); // Returnăm utilizatorii în format JSON
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err });
  }
});

// Mount auth routes
app.use('/api/auth', authRoutes);

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));