import type { SQSEvent, SQSHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  QueryCommand,
  BatchWriteItemCommand,
} from '@aws-sdk/client-dynamodb';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import * as Y from 'yjs';

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'syncbytes_document_deltas';
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'syncbytes-snapshots';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const ddbClient = new DynamoDBClient({ region: AWS_REGION });
const s3Client = new S3Client({ region: AWS_REGION });

interface CompactionMessage {
  documentId: string;
  trigger?: string;
  requestedAt?: number;
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  console.log(`[Compactor] Processing ${event.Records.length} SQS records...`);

  // Deduplicate document IDs in this batch
  const documentIds = new Set<string>();

  for (const record of event.Records) {
    try {
      const payload: CompactionMessage = JSON.parse(record.body);
      if (payload.documentId) {
        documentIds.add(payload.documentId);
      }
    } catch (err: any) {
      console.error('[Compactor] Invalid SQS record body:', record.body, err.message);
    }
  }

  console.log(`[Compactor] Found ${documentIds.size} unique documents to compact:`, Array.from(documentIds));

  for (const docId of documentIds) {
    await compactDocument(docId);
  }

  console.log('[Compactor] Batch compaction completed successfully.');
};

async function compactDocument(docId: string): Promise<void> {
  const startTime = Date.now();
  console.log(`[Compactor] Compacting document "${docId}"...`);

  try {
    // 1. Fetch current base snapshot from S3 if it exists
    const baseSnapshot = await getS3Snapshot(docId);

    // 2. Query all deltas from DynamoDB
    const deltasResponse = await ddbClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'document_id = :docId',
        ExpressionAttributeValues: {
          ':docId': { S: docId },
        },
        ScanIndexForward: true, // Chronological
      })
    );

    const items = deltasResponse.Items || [];
    if (items.length === 0 && !baseSnapshot) {
      console.log(`[Compactor] Document "${docId}" has no data to compact.`);
      return;
    }

    if (items.length === 0 && baseSnapshot) {
      console.log(`[Compactor] Document "${docId}" has no new deltas to merge.`);
      return;
    }

    // 3. Collect updates into array
    const updates: Uint8Array[] = [];
    if (baseSnapshot) {
      updates.push(baseSnapshot);
    }

    let maxSeq = 0;
    const deleteKeys: { document_id: { S: string }; version_seq: { N: string } }[] = [];

    for (const item of items) {
      const seq = parseInt(item.version_seq.N!, 10);
      maxSeq = Math.max(maxSeq, seq);
      const binary = Buffer.from(item.update_binary.S!, 'base64');
      updates.push(binary);

      deleteKeys.push({
        document_id: { S: docId },
        version_seq: { N: item.version_seq.N! },
      });
    }

    // 4. Merge all updates using Yjs CRDT merge
    const mergedSnapshot = Y.mergeUpdates(updates);

    // 5. Save consolidated snapshot to S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `snapshots/${docId}.bin`,
        Body: mergedSnapshot,
        ContentType: 'application/octet-stream',
      })
    );

    console.log(
      `[Compactor] Saved snapshot for "${docId}" to S3 (${mergedSnapshot.byteLength} bytes, merged ${items.length} deltas up to seq ${maxSeq})`
    );

    // 6. Delete compacted deltas from DynamoDB in chunks of 25 (DynamoDB BatchWriteItem limit)
    await deleteCompactedDeltas(deleteKeys);

    console.log(`[Compactor] Cleaned up ${deleteKeys.length} deltas from DynamoDB for "${docId}" in ${Date.now() - startTime}ms.`);
  } catch (err: any) {
    console.error(`[Compactor] Error compacting document "${docId}":`, err.message);
    throw err; // Trigger SQS retry / DLQ on failure
  }
}

async function getS3Snapshot(docId: string): Promise<Uint8Array | null> {
  try {
    const res = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `snapshots/${docId}.bin`,
      })
    );

    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return new Uint8Array(bytes);
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

async function deleteCompactedDeltas(
  keys: { document_id: { S: string }; version_seq: { N: string } }[]
): Promise<void> {
  const CHUNK_SIZE = 25;

  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    const chunk = keys.slice(i, i + CHUNK_SIZE);
    const writeRequests = chunk.map((key) => ({
      DeleteRequest: {
        Key: key,
      },
    }));

    await ddbClient.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [TABLE_NAME]: writeRequests,
        },
      })
    );
  }
}
