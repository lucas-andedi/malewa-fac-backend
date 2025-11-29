import { PutObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { s3Client } from '../config/storage';
import { env } from '../config/env';

// Configure multer for memory storage
const storage = multer.memoryStorage();

export const uploadMiddleware = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

/**
 * Uploads a file buffer to DigitalOcean Spaces (S3 compatible)
 * @param file The file object from multer (containing buffer, originalname, mimetype)
 * @param folder Optional folder path in the bucket
 * @returns The public URL of the uploaded file
 */
export async function uploadToSpaces(file: Express.Multer.File, folder: string = 'uploads'): Promise<string> {
  const fileExtension = path.extname(file.originalname);
  const randomName = crypto.randomBytes(16).toString('hex');
  const fileName = `${randomName}${fileExtension}`;
  const key = `${folder}/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: env.doSpacesBucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read',
  });

  await s3Client.send(command);

  // Construct the public URL logic (reused from previous implementation)
  let publicUrl = '';
  
  // If endpoint is just the bucket domain (e.g. malewaf-fac.sfo3.digitaloceanspaces.com)
  if (env.doSpacesEndpoint && !env.doSpacesEndpoint.startsWith('http')) {
     publicUrl = `https://${env.doSpacesEndpoint}/${key}`;
  } else if (env.doSpacesEndpoint && env.doSpacesEndpoint.startsWith('http')) {
      // remove trailing slash if any
      const baseUrl = env.doSpacesEndpoint.endsWith('/') ? env.doSpacesEndpoint.slice(0, -1) : env.doSpacesEndpoint;
      publicUrl = `${baseUrl}/${key}`;
  } else {
      // Fallback construction
     publicUrl = `https://${env.doSpacesBucket}.${env.doSpacesRegion}.digitaloceanspaces.com/${key}`;
  }

  return publicUrl;
}
