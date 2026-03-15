import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Request } from 'express';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_PROD = process.env.NODE_ENV === 'production';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cloudinary: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CloudinaryStorage: any;

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

  logger.info('Multer config: Using Cloudinary for file storage (PRODUCTION)');
} else {
  logger.info('Multer config: Using local disk storage (DEVELOPMENT)');
}

const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info('Created directory:', dirPath);
  }
};

// AVATAR STORAGE
let avatarStorage: multer.StorageEngine;
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
  const avatarDir = path.resolve(__dirname, '../../uploads/avatars');
  ensureDirectoryExists(avatarDir);

  avatarStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarDir),
    filename: (req: Request, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `user-${req.user!.id}-${uniqueSuffix}${ext}`);
    },
  });
}

// GROUP AVATAR STORAGE
let groupAvatarStorage: multer.StorageEngine;
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
  const groupAvatarDir = path.resolve(__dirname, '../../uploads/group-avatars');
  ensureDirectoryExists(groupAvatarDir);

  groupAvatarStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, groupAvatarDir),
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `group-${uniqueSuffix}${ext}`);
    },
  });
}

// MEDIA STORAGE
let mediaStorage: multer.StorageEngine;
if (IS_PROD) {
  mediaStorage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'pelegram/media',
      resource_type: 'auto',
      allowed_formats: [
        'jpeg', 'jpg', 'png', 'gif', 'webp',
        'mp4', 'webm', 'mov',
        'mp3', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'flac',
        'pdf', 'doc', 'docx', 'txt',
      ],
    },
  });
} else {
  const mediaDir = path.resolve(__dirname, '../../uploads/media');
  ensureDirectoryExists(mediaDir);

  mediaStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, mediaDir),
    filename: (req: Request, file, cb) => {
      const userId = req.user ? req.user.id : 'anonymous';
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `user-${userId}-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
  });
}

// File filters
const imageFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

const mediaFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/opus', 'audio/mp4', 'audio/aac', 'audio/flac',
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'));
  }
};

export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter,
});

export const uploadGroupAvatar = multer({
  storage: groupAvatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter,
});

export const uploadMedia = multer({
  storage: mediaStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: mediaFilter,
});

export const getFileUrl = (file: Express.Multer.File): string => {
  if (IS_PROD) {
    return (file as Express.Multer.File & { path: string }).path;
  } else {
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

export const deleteFileFromCloudinary = async (fileUrl: string): Promise<void> => {
  if (process.env.NODE_ENV !== 'production' || !fileUrl || !cloudinary) {
    return;
  }

  try {
    if (!fileUrl.includes('cloudinary.com')) {
      return;
    }
    const matches = fileUrl.match(/\/v\d+\/(.+?)(\.[^.]*)?$/);
    if (matches && matches[1]) {
      const publicId = matches[1];

      let resourceType = 'image';
      if (fileUrl.includes('/video/')) {
        resourceType = 'video';
      } else if (fileUrl.includes('/raw/')) {
        resourceType = 'raw';
      }

      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });

      if (result.result !== 'ok' && result.result !== 'not found') {
        // Unexpected result - no action needed, deletion is best-effort
      }
    }
  } catch (error) {
    logger.error('Failed to delete from Cloudinary:', error);

    if ((error as Error).message && (error as Error).message.includes('resource_type')) {
      try {
        const matches = fileUrl.match(/\/v\d+\/(.+?)(\.[^.]*)?$/);
        if (matches && matches[1]) {
          const publicId = matches[1];

          const resourceTypes = ['image', 'video', 'raw'];
          for (const resType of resourceTypes) {
            try {
              const result = await cloudinary.uploader.destroy(publicId, {
                resource_type: resType,
              });
              if (result.result === 'ok') {
                return;
              }
            } catch {
              // Continue trying other resource types
            }
          }
        }
      } catch (retryError) {
        logger.error('All Cloudinary retry attempts failed:', retryError);
      }
    }
  }
};
