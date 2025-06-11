import express from 'express';
import User from '../models/User.js';
import authenticateToken from '../middleware/authenticateToken.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const dir = path.join(__dirname, '../uploads/avatars');
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    cb(null, dir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `user-${req.user.id}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: function(req, file, cb) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only image files are allowed'));
    }
    
    cb(null, true);
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('username displayName bio avatar lastActive');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// Profile update
router.patch('/me', authenticateToken, async (req, res) => {
    try {
      const allowedUpdates = ['displayName', 'bio', 'phoneNumber', 'settings'];
      const updates = {};
      
      Object.keys(req.body).forEach(key => {
        if (allowedUpdates.includes(key)) {
          if (key === 'settings' && typeof req.body.settings === 'object') {
            updates.settings = {
              ...(req.body.settings || {})
            };
          } else {
            updates[key] = req.body[key];
          }
        }
      });
      
      updates.updatedAt = new Date();
      
      const user = await User.findByIdAndUpdate(
        req.user.id,
        { $set: updates },
        { new: true, runValidators: true }
      ).select('-password');
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json(user);
    } catch (err) {
      console.error('Error updating profile:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
  
router.post('/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const oldAvatarUrl = user.avatar;
    
    user.avatar = avatarUrl;
    user.updatedAt = new Date();
    await user.save();
    
    if (oldAvatarUrl && oldAvatarUrl !== avatarUrl) {
      const oldAvatarPath = path.join(__dirname, '..', oldAvatarUrl);
      
      fs.access(oldAvatarPath, fs.constants.F_OK, (err) => {
        if (!err) {
          fs.unlink(oldAvatarPath, (unlinkErr) => {
            if (unlinkErr) {
              console.error(`Failed to delete old avatar: ${unlinkErr.message}`);
            } else {
              console.log(`Successfully deleted old avatar: ${oldAvatarPath}`);
            }
          });
        }
      });
    }
    
    res.json({ 
      success: true, 
      avatar: avatarUrl,
      user
    });
  } catch (err) {
    console.error('Error uploading avatar:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
  

router.delete('/avatar', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.avatar) {
      return res.status(400).json({ error: 'User does not have an avatar to delete' });
    }

    const avatarPathToDelete = user.avatar;
    const fullPathToDelete = path.join(__dirname, '..', avatarPathToDelete);

    user.avatar = null; // or user.avatar = '';
    user.updatedAt = new Date();
    await user.save();

    fs.access(fullPathToDelete, fs.constants.F_OK, (err) => {
      if (!err) {
        fs.unlink(fullPathToDelete, (unlinkErr) => {
          if (unlinkErr) {
            console.error(`Failed to delete avatar file ${fullPathToDelete}: ${unlinkErr.message}`);
          } else {
            console.log(`Successfully deleted avatar file: ${fullPathToDelete}`);
          }
        });
      } else {
        console.warn(`Avatar file not found for deletion, but removed from DB: ${fullPathToDelete}`);
      }
    });

    const updatedUser = await User.findById(req.user.id).select('-password');
    res.json({ 
        success: true, 
        message: 'Avatar deleted successfully',
        user: updatedUser
    });

  } catch (err) {
    console.error('Error deleting avatar:', err);
    res.status(500).json({ error: 'Server error while deleting avatar' });
  }
});
export { router as profileRoutes };
