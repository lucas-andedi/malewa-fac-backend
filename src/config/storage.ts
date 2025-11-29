import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env';

// If the provided endpoint contains the bucket name (common mistake), use the region endpoint instead
const endpoint = env.doSpacesEndpoint.includes(env.doSpacesBucket) && env.doSpacesRegion
  ? `https://${env.doSpacesRegion}.digitaloceanspaces.com`
  : `https://${env.doSpacesEndpoint}`;

export const s3Client = new S3Client({
  endpoint,
  region: env.doSpacesRegion,
  credentials: {
    accessKeyId: env.doSpacesKey,
    secretAccessKey: env.doSpacesSecret,
  },
  forcePathStyle: false, // DigitalOcean Spaces supports virtual-hosted-style URLs
});
