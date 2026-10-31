/**
 * Local Service Initializer for SyncBytes
 * Creates required DynamoDB tables and S3 buckets on local emulators.
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  ListTablesCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';

const DYNAMO_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const ddbClient = new DynamoDBClient({
  endpoint: DYNAMO_ENDPOINT,
  region: 'local',
  credentials: {
    accessKeyId: 'fakeMyKeyId',
    secretAccessKey: 'fakeSecretAccessKey',
  },
});

const s3Client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: AWS_REGION,
  credentials: {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadminpassword',
  },
  forcePathStyle: true,
});

async function initDynamoDB() {
  console.log(`[DynamoDB] Checking tables at ${DYNAMO_ENDPOINT}...`);
  const tableName = 'syncbytes_document_deltas';

  try {
    const { TableNames } = await ddbClient.send(new ListTablesCommand({}));
    if (TableNames && TableNames.includes(tableName)) {
      console.log(`[DynamoDB] Table "${tableName}" already exists.`);
      return;
    }

    console.log(`[DynamoDB] Creating table "${tableName}"...`);
    await ddbClient.send(
      new CreateTableCommand({
        TableName: tableName,
        KeySchema: [
          { AttributeName: 'document_id', KeyType: 'HASH' },  // Partition key
          { AttributeName: 'version_seq', KeyType: 'RANGE' }, // Sort key (timestamp or sequence)
        ],
        AttributeDefinitions: [
          { AttributeName: 'document_id', AttributeType: 'S' },
          { AttributeName: 'version_seq', AttributeType: 'N' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      })
    );
    console.log(`[DynamoDB] Table "${tableName}" created successfully.`);
  } catch (err) {
    console.error('[DynamoDB] Error initializing table:', err.message);
  }
}

async function initS3() {
  console.log(`[S3/MinIO] Checking buckets at ${S3_ENDPOINT}...`);
  const bucketName = 'syncbytes-snapshots';

  try {
    const { Buckets } = await s3Client.send(new ListBucketsCommand({}));
    const exists = Buckets?.some((b) => b.Name === bucketName);

    if (exists) {
      console.log(`[S3/MinIO] Bucket "${bucketName}" already exists.`);
      return;
    }

    console.log(`[S3/MinIO] Creating bucket "${bucketName}"...`);
    await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
    console.log(`[S3/MinIO] Bucket "${bucketName}" created successfully.`);
  } catch (err) {
    console.error('[S3/MinIO] Error initializing bucket:', err.message);
  }
}

async function main() {
  console.log('=== SyncBytes Local Environment Initializer ===\n');
  await initDynamoDB();
  await initS3();
  console.log('\n=== Initialization Complete ===');
}

main().catch(console.error);
