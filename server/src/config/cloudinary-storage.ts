import { Request } from 'express';
import { StorageEngine } from 'multer';

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  bytes?: number;
  resource_type?: string;
  format?: string;
}

type UploadCallback = (error: Error | undefined, result?: CloudinaryUploadResult) => void;

export interface CloudinaryLike {
  uploader: {
    upload_stream(options: Record<string, unknown>, callback: UploadCallback): NodeJS.WritableStream;
    destroy(publicId: string, options?: Record<string, unknown>): Promise<{ result: string }>;
  };
}

export class CloudinaryStorageEngine implements StorageEngine {
  constructor(
    private readonly cloudinary: CloudinaryLike,
    private readonly params: Record<string, unknown>
  ) {}

  _handleFile(
    _req: Request,
    file: Express.Multer.File,
    callback: (error?: Error | null, info?: Partial<Express.Multer.File>) => void
  ): void {
    let settled = false;
    const settle = (error?: Error | null, info?: Partial<Express.Multer.File>) => {
      if (settled) return;
      settled = true;
      callback(error, info);
    };

    const uploadStream = this.cloudinary.uploader.upload_stream(this.params, (error, result) => {
      if (error) {
        settle(error);
        return;
      }
      if (!result) {
        settle(new Error('Cloudinary upload returned no result'));
        return;
      }
      settle(null, {
        path: result.secure_url,
        filename: result.public_id,
        size: result.bytes,
      });
    });

    file.stream.on('error', (error: Error) => settle(error));
    uploadStream.on('error', (error: Error) => settle(error));

    file.stream.pipe(uploadStream);
  }

  _removeFile(
    _req: Request,
    file: Express.Multer.File,
    callback: (error: Error | null) => void
  ): void {
    const publicId = file.filename;
    if (!publicId) {
      callback(null);
      return;
    }

    const resourceType = typeof this.params['resource_type'] === 'string'
      ? (this.params['resource_type'] as string)
      : 'image';

    this.cloudinary.uploader
      .destroy(publicId, { resource_type: resourceType === 'auto' ? 'image' : resourceType })
      .then(() => callback(null))
      .catch((error: Error) => callback(error));
  }
}
