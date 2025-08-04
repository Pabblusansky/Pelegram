import express from 'express';
import User from '../models/User.js';
import authenticateToken from '../middleware/authenticateToken.js';
import { uploadAvatar, getFileUrl, deleteFileFromCloudinary } from '../config/multer-config.js';
import path from 'path';
import fs from 'fs';

const router = express.Router();

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
    const validationErrors = {};

    const currentUserData = await User.findById(req.user.id);
    if (!currentUserData) {
      return res.status(404).json({ error: 'User not found for update' });
    }

    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        const value = req.body[key];

        switch (key) {
          case 'phoneNumber':
            if (value != null && value !== '') {
              const phoneRegex = /^\+?[0-9]{7,14}$/;
              if (!phoneRegex.test(value)) {
                validationErrors[key] = 'Invalid phone number. Must contain 7-15 digits and may include spaces, (), +, -.';
              } else {
                updates[key] = value;
              }
            } else if (value === '') { 
              updates[key] = null;
            }
            break;

          case 'settings':
            if (typeof value === 'object' && value !== null) {
              updates.settings = { ...(currentUserData.settings || {}) };

              if (value.hasOwnProperty('theme')) {
                const validThemes = ['light', 'dark', 'system'];
                if (!validThemes.includes(value.theme)) {
                  validationErrors['settings.theme'] = 'Invalid theme value.';
                } else {
                  updates.settings.theme = value.theme;
                }
              }
              if (value.hasOwnProperty('notifications')) {
                if (typeof value.notifications !== 'boolean') {
                    validationErrors['settings.notifications'] = 'Notifications value must be a boolean.';
                } else {
                    updates.settings.notifications = value.notifications;
                }
              }
              if (value.hasOwnProperty('soundEnabled')) {
                 if (typeof value.soundEnabled !== 'boolean') {
                    validationErrors['settings.soundEnabled'] = 'Sound enabled value must be a boolean.';
                } else {
                    updates.settings.soundEnabled = value.soundEnabled;
                }
              }
            } else if (value !== undefined) {
                validationErrors[key] = 'Settings must be an object.';
            }
            break;

          case 'displayName':
            if (value != null) { 
                const trimmedName = String(value).trim(); 
                if (trimmedName.length === 0 && String(value).length > 0) {
                    validationErrors[key] = 'Display name cannot consist only of spaces.';
                } else if (trimmedName.length > 0 && trimmedName.length > 50) {
                    validationErrors[key] = 'Display name cannot exceed 50 characters.';
                } else if (trimmedName.length === 0 && currentUserData.displayName && String(value) === '') {
                    updates[key] = '';
                } else if (trimmedName.length > 0) {
                    updates[key] = trimmedName;
                } else if (String(value) === '') { 
                    updates[key] = '';
                }
            }
            break;

          case 'bio':
            if (value != null) {
                if (String(value).length > 250) {
                    validationErrors[key] = 'Bio cannot exceed 250 characters.';
                } else {
                    updates[key] = String(value); 
                }
            }
            break;

          default:
            updates[key] = value;
            break;
        }
      }
    });

    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    if (Object.keys(updates).length === 0) {
      const userToReturn = await User.findById(req.user.id).select('-password');
      return res.json(userToReturn);
    }

    updates.updatedAt = new Date();

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found during final update step' });
    }

    res.json(updatedUser);

  } catch (err) {
    console.error('Error updating profile:', err);
    if (err.name === 'ValidationError')  {
      const errors = {};
      for (const field in err.errors) {
        errors[field] = err.errors[field].message;
      }
      return res.status(400).json({ errors });
    }
    res.status(500).json({ error: 'Server error' });
  }
});
  
router.post('/avatar', authenticateToken, uploadAvatar.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const avatarUrl = getFileUrl(req.file);
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const oldAvatarUrl = user.avatar;
    
    user.avatar = avatarUrl;
    user.updatedAt = new Date();
    await user.save();
    
    if (oldAvatarUrl && oldAvatarUrl !== avatarUrl) {
      if (process.env.NODE_ENV !== 'production') {
        const oldAvatarPath = path.join(process.cwd(), oldAvatarUrl);
        
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
      } else {
        await deleteFileFromCloudinary(oldAvatarUrl);
      }
    }
    
    res.json({ 
      success: true, 
      avatar: avatarUrl,
      user: user.toObject({ virtuals: true, versionKey: false, transform: (doc, ret) => { delete ret.password; return ret; }})
    });
  } catch (err) {
    console.error('Error uploading avatar:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/avatar', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.avatar) {
      return res.status(400).json({ error: 'User does not have an avatar to delete' });
    }

    const avatarToDelete = user.avatar;
    
    user.avatar = null;
    user.updatedAt = new Date();
    await user.save();

    if (process.env.NODE_ENV !== 'production') {
      const fullPathToDelete = path.join(process.cwd(), avatarToDelete);
      if (fs.existsSync(fullPathToDelete)) {
        fs.unlinkSync(fullPathToDelete);
        console.log(`🗑️ Deleted local avatar: ${fullPathToDelete}`);
      }
    } else {
      await deleteFileFromCloudinary(avatarToDelete);
    }

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
