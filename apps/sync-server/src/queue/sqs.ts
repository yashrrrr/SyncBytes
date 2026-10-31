import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { config } from '../config.js';

const sqsOptions: any = {
  region: config.awsRegion,
};

if (config.sqsEndpoint) {
  sqsOptions.endpoint = config.sqsEndpoint;
  sqsOptions.credentials = {
    accessKeyId: 'mock-key',
    secretAccessKey: 'mock-secret',
  };
}

export const sqsClient = new SQSClient(sqsOptions);

export interface CompactionMessage {
  documentId: string;
  trigger: 'delta_threshold' | 'room_close' | 'periodic';
  requestedAt: number;
}

/**
 * Enqueues a compaction task to SQS for serverless Lambda execution
 */
export async function triggerCompaction(
  documentId: string,
  trigger: CompactionMessage['trigger'] = 'delta_threshold'
): Promise<void> {
  if (!config.sqsQueueUrl) {
    // SQS queue not configured (e.g. running locally without SQS emulator)
    return;
  }

  const payload: CompactionMessage = {
    documentId,
    trigger,
    requestedAt: Date.now(),
  };

  try {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: config.sqsQueueUrl,
        MessageBody: JSON.stringify(payload),
      })
    );
    console.log(`[SQS] Enqueued compaction job for document: ${documentId}`);
  } catch (err: any) {
    console.error(`[SQS] Failed to enqueue compaction for ${documentId}:`, err.message);
  }
}
