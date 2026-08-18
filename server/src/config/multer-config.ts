import multer, { FileFilterCallback } from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Request } from 'express';
import { env, isProduction } from './env.js';
import logger from './logger.js';
import { CloudinaryStorageEngine, CloudinaryLike } from './cloudinary-storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_PROD = isProduction;

let cloudinary: (CloudinaryLike & { config(options: Record<string, unknown>): void }) | undefined;

if (IS_PROD) {
  const cloudinaryModule = await import('cloudinary');
  const configured = cloudinaryModule.v2 as unknown as NonNullable<typeof cloudinary>;
  cloudinary = configured;

  configured.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  logger.info('Multer config: Using Cloudinary for file storage (PRODUCTION)');
} else {
  logger.info('Multer config: Using local disk storage (DEVELOPMENT)');
}

const requireCloudinary = (): CloudinaryLike => {
  if (!cloudinary) {
    throw new Error('Cloudinary storage requested but Cloudinary is not configured');
  }
  return cloudinary;
};

/**
 * Canonical extension per accepted MIME type.
 *
 * The extension of a stored file decides the Content-Type express.static
 * serves it with, so it must never be taken from the client-supplied
 * originalname: uploading "payload.html" while declaring an image MIME type
 * would otherwise persist an HTML document under /media and get it served as
 * text/html from the API origin. Anything not listed here is stored without an
 * extension, which express.static serves as application/octet-stream.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.weba',
  'audio/opus': '.opus',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/flac': '.flac',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
};

export const safeExtension = (mimetype: string): string => EXTENSION_BY_MIME[mimetype] ?? '';

/**
 * Unguessable filename suffix.
 *
 * /uploads and /media are mounted ahead of authenticateToken, so the URL is
 * the only thing protecting a private chat attachment. Math.random() is not a
 * CSPRNG and its output is recoverable from a handful of observed samples.
 */
export const randomFileSuffix = (): string => crypto.randomBytes(16).toString('hex');

const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info('Created directory:', dirPath);
  }
};

// AVATAR STORAGE
let avatarStorage: multer.StorageEngine;
if (IS_PROD) {
  avatarStorage = new CloudinaryStorageEngine(requireCloudinary(), {
    folder: 'pelegram/avatars',
    allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
    transformation: [{ width: 300, height: 300, crop: 'fill', quality: 'auto' }],
  });
} else {
  const avatarDir = path.resolve(__dirname, '../../uploads/avatars');
  ensureDirectoryExists(avatarDir);

  avatarStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarDir),
    filename: (req: Request, file, cb) => {
      cb(null, `user-${req.user!.id}-${randomFileSuffix()}${safeExtension(file.mimetype)}`);
    },
  });
}

// GROUP AVATAR STORAGE
let groupAvatarStorage: multer.StorageEngine;
if (IS_PROD) {
  groupAvatarStorage = new CloudinaryStorageEngine(requireCloudinary(), {
    folder: 'pelegram/group-avatars',
    allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', quality: 'auto' }],
  });
} else {
  const groupAvatarDir = path.resolve(__dirname, '../../uploads/group-avatars');
  ensureDirectoryExists(groupAvatarDir);

  groupAvatarStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, groupAvatarDir),
    filename: (_req, file, cb) => {
      cb(null, `group-${randomFileSuffix()}${safeExtension(file.mimetype)}`);
    },
  });
}

// MEDIA STORAGE
let mediaStorage: multer.StorageEngine;
if (IS_PROD) {
  mediaStorage = new CloudinaryStorageEngine(requireCloudinary(), {
    folder: 'pelegram/media',
    resource_type: 'auto',
    allowed_formats: [
      'jpeg', 'jpg', 'png', 'gif', 'webp',
      'mp4', 'webm', 'mov',
      'mp3', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'flac',
      'pdf', 'doc', 'docx', 'txt',
    ],
  });
} else {
  const mediaDir = path.resolve(__dirname, '../../uploads/media');
  ensureDirectoryExists(mediaDir);

  mediaStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, mediaDir),
    filename: (req: Request, file, cb) => {
      const userId = req.user ? req.user.id : 'anonymous';
      cb(null, `user-${userId}-${randomFileSuffix()}${safeExtension(file.mimetype)}`);
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
  if (!IS_PROD || !fileUrl || !cloudinary) {
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
