import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const hasAwsCredentials = Boolean(
  process.env.AWS_ACCESS_KEY_ID || process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
);

export const config = {
  isProduction,
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  // In development, default to local emulators with fallback mock credentials
  dynamoEndpoint: process.env.DYNAMODB_ENDPOINT || (isProduction ? undefined : 'http://localhost:8000'),
  dynamoTable: process.env.DYNAMODB_TABLE_NAME || 'syncbytes_document_deltas',
  s3Endpoint: process.env.S3_ENDPOINT || (isProduction ? undefined : 'http://localhost:9000'),
  s3Bucket: process.env.S3_BUCKET_NAME || 'syncbytes-snapshots',
  sqsQueueUrl: process.env.SQS_QUEUE_URL || '',
  sqsEndpoint: process.env.SQS_ENDPOINT,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  compactionThreshold: parseInt(process.env.COMPACTION_DELTA_THRESHOLD || '100', 10),
  debounceFlushMs: parseInt(process.env.DEBOUNCE_FLUSH_MS || '500', 10),
  hasAwsCredentials,
};
