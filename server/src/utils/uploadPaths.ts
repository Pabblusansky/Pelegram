import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UPLOAD_BASE_DIR = path.resolve(__dirname, '../../uploads');

/**
 * Resolves a stored filePath ("/media/x.png", "/uploads/avatars/y.png") to a
 * disk path, or null when it does not stay inside the uploads directory.
 *
 * Stored paths are not automatically trustworthy: they are persisted on the
 * message document, and anything that can write that field can otherwise steer
 * the unlink calls in the delete handlers at arbitrary files via "..".
 */
export function resolveUploadPath(filePath: unknown): string | null {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return null;
  }

  let relative: string;
  if (filePath.startsWith('/media/')) {
    relative = filePath.slice('/'.length);
  } else if (filePath.startsWith('/uploads/')) {
    relative = filePath.replace('/uploads/', '');
  } else {
    return null;
  }

  const resolved = path.resolve(UPLOAD_BASE_DIR, relative);
  const base = UPLOAD_BASE_DIR + path.sep;

  if (resolved !== UPLOAD_BASE_DIR && !resolved.startsWith(base)) {
    return null;
  }

  return resolved;
}
