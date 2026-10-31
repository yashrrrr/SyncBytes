import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { config } from '../config.js';

const s3Options: any = {
  region: config.awsRegion,
};

if (config.s3Endpoint) {
  s3Options.endpoint = config.s3Endpoint;
  s3Options.forcePathStyle = true;
  s3Options.credentials = {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadminpassword',
  };
} else if (!config.isProduction && !config.hasAwsCredentials) {
  s3Options.credentials = {
    accessKeyId: 'mock-key',
    secretAccessKey: 'mock-secret',
  };
}

export const s3Client = new S3Client(s3Options);

// In-memory fallback snapshot store for offline local development
const inMemorySnapshots = new Map<string, Uint8Array>();

/**
 * Loads the latest compacted snapshot for a document from S3 with memory fallback
 */
export async function getDocumentSnapshot(documentId: string): Promise<Uint8Array | null> {
  const key = `snapshots/${documentId}.bin`;

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
      })
    );

    if (response.Body) {
      const byteArray = await response.Body.transformToByteArray();
      return new Uint8Array(byteArray);
    }
  } catch {
    // S3 or local MinIO unavailable; check memory fallback
  }

  return inMemorySnapshots.get(documentId) || null;
}

/**
 * Saves a compacted snapshot to S3 with memory fallback
 */
export async function saveDocumentSnapshot(
  documentId: string,
  snapshot: Uint8Array
): Promise<void> {
  inMemorySnapshots.set(documentId, snapshot);

  const key = `snapshots/${documentId}.bin`;

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
        Body: snapshot,
        ContentType: 'application/octet-stream',
      })
    );
  } catch (err: any) {
    if (config.isProduction) {
      console.error(`[S3] Error saving snapshot for ${documentId}:`, err.message);
    }
  }
}
