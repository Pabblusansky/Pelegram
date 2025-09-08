import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_PROD = process.env.NODE_ENV === 'production';

let cloudinary, CloudinaryStorage;

if (IS_PROD) {
  const cloudinaryModule = await import('cloudinary');
  cloudinary = cloudinaryModule.v2;
  
  const cloudinaryStorageModule = await import('multer-storage-cloudinary');
  CloudinaryStorage = cloudinaryStorageModule.CloudinaryStorage;
  
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  
  console.log('📤 Multer config: Using Cloudinary for file storage (PRODUCTION)');
} else {
  console.log('💾 Multer config: Using local disk storage (DEVELOPMENT)');
}

// Utility to ensure directory exists (local development)
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
};

// AVATAR STORAGE
let avatarStorage;
if (IS_PROD) {
  avatarStorage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'pelegram/avatars',
      allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
      transformation: [{ width: 300, height: 300, crop: 'fill', quality: 'auto' }],
    },
  });
} else {
  const avatarDir = path.resolve(__dirname, '../uploads/avatars');
  ensureDirectoryExists(avatarDir);
  
  avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `user-${req.user.id}-${uniqueSuffix}${ext}`);
    }
  });
}

// GROUP AVATAR STORAGE  
let groupAvatarStorage;
if (IS_PROD) {
  groupAvatarStorage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'pelegram/group-avatars',
      allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
      transformation: [{ width: 400, height: 400, crop: 'fill', quality: 'auto' }],
    },
  });
} else {
  const groupAvatarDir = path.resolve(__dirname, '../uploads/group-avatars');
  ensureDirectoryExists(groupAvatarDir);
  
  groupAvatarStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, groupAvatarDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `group-${uniqueSuffix}${ext}`);
    }
  });
}

// MEDIA STORAGE
let mediaStorage;
if (IS_PROD) {
  mediaStorage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'pelegram/media',
      resource_type: 'auto', // auto-detect: image, video, raw
      allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mp3', 'wav', 'pdf', 'doc', 'docx'],
    },
  });
} else {
  const mediaDir = path.resolve(__dirname, '../uploads/media');
  ensureDirectoryExists(mediaDir);
  
  mediaStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, mediaDir),
    filename: (req, file, cb) => {
      const userId = req.user ? req.user.id : 'anonymous';
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `user-${userId}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  });
}

// File filters
const imageFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const mediaFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'), false);
  }
};

// Multer upload instances
export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter
});

export const uploadGroupAvatar = multer({
  storage: groupAvatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB  
  fileFilter: imageFilter
});

export const uploadMedia = multer({
  storage: mediaStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: mediaFilter
});

// Get file URL helper
export const getFileUrl = (file) => {
  if (IS_PROD) {
    return file.path; // Cloudinary returns full HTTPS URL
  } else {
    // For local development, return relative path
    if (file.destination.includes('avatars')) {
      return `/uploads/avatars/${file.filename}`;
    } else if (file.destination.includes('group-avatars')) {
      return `/uploads/group-avatars/${file.filename}`;
    } else if (file.destination.includes('media')) {
      return `/media/${file.filename}`;
    }
    return `/uploads/${file.filename}`;
  }
};

// Function to delete file from Cloudinary
export const deleteFileFromCloudinary = async (fileUrl) => {
  if (process.env.NODE_ENV !== 'production' || !fileUrl || !cloudinary) {
    console.log('🔄 Skipping Cloudinary deletion (not production or missing parameters):', fileUrl);
    return;
  }

  try {
    if (!fileUrl.includes('cloudinary.com')) {
      console.log('🔄 Not a Cloudinary URL, skipping deletion:', fileUrl);
      return;
    }
    const matches = fileUrl.match(/\/v\d+\/(.+?)(\.[^.]*)?$/);
    if (matches && matches[1]) {
      const publicId = matches[1];
      console.log(`🗑️ Attempting to delete from Cloudinary with public_id: ${publicId}`);
      
      let resourceType = 'image';
      if (fileUrl.includes('/video/')) {
        resourceType = 'video';
      } else if (fileUrl.includes('/raw/')) {
        resourceType = 'raw';
      }
      
      const result = await cloudinary.uploader.destroy(publicId, { 
        resource_type: resourceType 
      });
      
      if (result.result === 'ok') {
        console.log(`✅ Successfully deleted from Cloudinary: ${publicId}`);
      } else if (result.result === 'not found') {
        console.log(`ℹ️ File not found in Cloudinary (already deleted?): ${publicId}`);
      } else {
        console.warn(`⚠️ Cloudinary deletion result: ${result.result} for ${publicId}`);
      }
    } else {
      console.warn('⚠️ Could not extract public_id from URL:', fileUrl);
    }
  } catch (error) {
    console.error('❌ Failed to delete from Cloudinary:', error);
    
    if (error.message && error.message.includes('resource_type')) {
      console.log('🔄 Retrying with different resource types...');
      
      try {
        const matches = fileUrl.match(/\/v\d+\/(.+?)(\.[^.]*)?$/);
        if (matches && matches[1]) {
          const publicId = matches[1];
          
          const resourceTypes = ['image', 'video', 'raw'];
          for (const resType of resourceTypes) {
            try {
              const result = await cloudinary.uploader.destroy(publicId, { 
                resource_type: resType 
              });
              if (result.result === 'ok') {
                console.log(`✅ Successfully deleted from Cloudinary with type ${resType}: ${publicId}`);
                return;
              }
            } catch (typeError) {
              console.log(`⚠️ Failed to delete with type ${resType}:`, typeError.message);
            }
          }
        }
      } catch (retryError) {
        console.error('❌ All retry attempts failed:', retryError);
      }
    }
  }
};