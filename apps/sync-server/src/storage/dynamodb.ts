import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { config } from '../config.js';

const clientOptions: any = {
  region: config.awsRegion,
};

if (config.dynamoEndpoint) {
  clientOptions.endpoint = config.dynamoEndpoint;
  clientOptions.credentials = {
    accessKeyId: 'mock-key',
    secretAccessKey: 'mock-secret',
  };
} else if (!config.isProduction && !config.hasAwsCredentials) {
  clientOptions.credentials = {
    accessKeyId: 'mock-key',
    secretAccessKey: 'mock-secret',
  };
}

export const ddbClient = new DynamoDBClient(clientOptions);

export interface StoredDelta {
  documentId: string;
  versionSeq: number;
  updateBinary: Uint8Array;
  timestamp: number;
}

// In-memory fallback delta store for offline local development
const inMemoryDeltas = new Map<string, StoredDelta[]>();

/**
 * Appends a raw binary CRDT update to the DynamoDB delta log with in-memory fallback
 */
export async function appendDelta(
  documentId: string,
  versionSeq: number,
  update: Uint8Array
): Promise<void> {
  const binaryBase64 = Buffer.from(update).toString('base64');

  // Always store in memory fallback
  let list = inMemoryDeltas.get(documentId);
  if (!list) {
    list = [];
    inMemoryDeltas.set(documentId, list);
  }
  list.push({
    documentId,
    versionSeq,
    updateBinary: update,
    timestamp: Date.now(),
  });

  try {
    await ddbClient.send(
      new PutItemCommand({
        TableName: config.dynamoTable,
        Item: {
          document_id: { S: documentId },
          version_seq: { N: versionSeq.toString() },
          update_binary: { S: binaryBase64 },
          created_at: { N: Date.now().toString() },
        },
      })
    );
  } catch (err: any) {
    // If DynamoDB is offline or credentials unavailable, keep deltas in memory
    // without crashing the active room
    if (!config.isProduction) {
      // Quietly fall back in dev
      return;
    }
    console.error(`[DynamoDB] Failed to persist delta for "${documentId}":`, err.message);
  }
}

/**
 * Queries all deltas for a document with version_seq > afterSeq
 */
export async function getDeltas(
  documentId: string,
  afterSeq: number = 0
): Promise<StoredDelta[]> {
  try {
    const response = await ddbClient.send(
      new QueryCommand({
        TableName: config.dynamoTable,
        KeyConditionExpression: 'document_id = :docId AND version_seq > :afterSeq',
        ExpressionAttributeValues: {
          ':docId': { S: documentId },
          ':afterSeq': { N: afterSeq.toString() },
        },
        ScanIndexForward: true,
      })
    );

    if (response.Items && response.Items.length > 0) {
      return response.Items.map((item) => ({
        documentId: item.document_id.S!,
        versionSeq: parseInt(item.version_seq.N!, 10),
        updateBinary: Buffer.from(item.update_binary.S!, 'base64'),
        timestamp: parseInt(item.created_at?.N || '0', 10),
      }));
    }
  } catch {
    // Return in-memory deltas if DynamoDB is unavailable locally
  }

  const memoryList = inMemoryDeltas.get(documentId) || [];
  return memoryList.filter((d) => d.versionSeq > afterSeq);
}
