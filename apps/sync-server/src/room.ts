import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WebSocket } from 'ws';
import { config } from './config.js';
import { appendDelta, getDeltas } from './storage/dynamodb.js';
import { getDocumentSnapshot } from './storage/s3.js';
import { triggerCompaction } from './queue/sqs.js';
import { pubsub } from './pubsub/redis.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

export class DocumentRoom {
  public readonly docId: string;
  public readonly doc: Y.Doc;
  public readonly awareness: awarenessProtocol.Awareness;
  public readonly conns: Set<WebSocket> = new Set();

  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;
  private currentVersionSeq = 0;
  private uncompactedDeltaCount = 0;
  private updateBuffer: Uint8Array[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(docId: string) {
    this.docId = docId;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);

    // Broadcast local awareness changes to connected clients
    this.awareness.on('update', ({ added, updated, removed }: any, origin: any) => {
      const changedClients = added.concat(updated, removed);
      const message = this.createAwarenessMessage(changedClients);
      this.broadcast(message, origin);
    });

    // Handle document updates
    this.doc.on('update', (update: Uint8Array, origin: any) => {
      // 1. Broadcast to other local WebSocket connections
      const message = this.createSyncMessage(update);
      this.broadcast(message, origin);

      // 2. Publish to Redis for other server instances if the origin was local
      if (origin !== 'redis') {
        const redisPayload = new Uint8Array(update.length + 1);
        redisPayload[0] = MESSAGE_SYNC;
        redisPayload.set(update, 1);
        pubsub.publish(`syncbytes:doc:${this.docId}`, redisPayload);
      }

      // 3. Buffer update for DynamoDB persistence
      this.bufferUpdate(update);
    });

    // Subscribe to Redis updates for this room
    pubsub.subscribe(`syncbytes:doc:${this.docId}`, (_channel, messageBuffer) => {
      const messageType = messageBuffer[0];
      const payload = new Uint8Array(messageBuffer.subarray(1));

      if (messageType === MESSAGE_SYNC) {
        Y.applyUpdate(this.doc, payload, 'redis');
      }
    });
  }

  /**
   * Loads base snapshot from S3 and replayed deltas from DynamoDB
   */
  public async load(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      console.log(`[Room ${this.docId}] Hydrating state from storage...`);
      const startTime = Date.now();

      try {
        // 1. Try loading base snapshot from S3
        const snapshot = await getDocumentSnapshot(this.docId);
        if (snapshot) {
          Y.applyUpdate(this.doc, snapshot, 'storage');
          console.log(`[Room ${this.docId}] Loaded base snapshot (${snapshot.byteLength} bytes)`);
        }

        // 2. Query pending deltas from DynamoDB
        const deltas = await getDeltas(this.docId, 0);
        if (deltas.length > 0) {
          console.log(`[Room ${this.docId}] Replaying ${deltas.length} deltas...`);
          for (const delta of deltas) {
            Y.applyUpdate(this.doc, delta.updateBinary, 'storage');
            this.currentVersionSeq = Math.max(this.currentVersionSeq, delta.versionSeq);
          }
          this.uncompactedDeltaCount = deltas.length;
        }
      } catch (err: any) {
        console.warn(`[Room ${this.docId}] Storage hydration skipped, running in-memory:`, err.message);
      }

      this.isLoaded = true;
      console.log(`[Room ${this.docId}] Ready in ${Date.now() - startTime}ms. Current sequence: ${this.currentVersionSeq}`);
    })();

    return this.loadPromise;
  }

  /**
   * Adds a WebSocket connection and runs standard Yjs handshake
   */
  public async addConnection(ws: WebSocket): Promise<void> {
    await this.load();
    this.conns.add(ws);

    // 1. Send SyncStep 1 (Server state vector to client)
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    this.send(ws, encoding.toUint8Array(encoder));

    // 2. Send current awareness states
    const awarenessStates = this.awareness.getStates();
    if (awarenessStates.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(
          this.awareness,
          Array.from(awarenessStates.keys())
        )
      );
      this.send(ws, encoding.toUint8Array(awarenessEncoder));
    }

    ws.on('message', (message: ArrayBuffer | Buffer) => {
      this.handleMessage(ws, new Uint8Array(message as any));
    });

    ws.on('close', () => {
      this.removeConnection(ws);
    });
  }

  public removeConnection(ws: WebSocket): void {
    this.conns.delete(ws);

    if (this.conns.size === 0) {
      // Flush any pending updates when room becomes idle
      this.flushUpdates();

      if (this.uncompactedDeltaCount >= config.compactionThreshold) {
        triggerCompaction(this.docId, 'room_close');
      }
    }
  }

  private handleMessage(ws: WebSocket, message: Uint8Array): void {
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws);
        if (encoding.length(encoder) > 1) {
          this.send(ws, encoding.toUint8Array(encoder));
        }
        break;
      }
      case MESSAGE_AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(this.awareness, update, ws);
        break;
      }
      default:
        console.warn(`[Room ${this.docId}] Unknown message type: ${messageType}`);
    }
  }

  private bufferUpdate(update: Uint8Array): void {
    this.updateBuffer.push(update);

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushUpdates();
      }, config.debounceFlushMs);
    }
  }

  private async flushUpdates(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.updateBuffer.length === 0) return;

    const updatesToFlush = this.updateBuffer;
    this.updateBuffer = [];

    // Merge multiple buffered micro-updates into a single consolidated binary update
    const mergedUpdate = Y.mergeUpdates(updatesToFlush);
    this.currentVersionSeq += 1;
    this.uncompactedDeltaCount += 1;

    try {
      await appendDelta(this.docId, this.currentVersionSeq, mergedUpdate);

      // Check if compaction threshold reached
      if (this.uncompactedDeltaCount >= config.compactionThreshold) {
        triggerCompaction(this.docId, 'delta_threshold');
        this.uncompactedDeltaCount = 0;
      }
    } catch (err: any) {
      console.error(`[Room ${this.docId}] Failed to append delta:`, err.message);
    }
  }

  private broadcast(message: Uint8Array, origin: any): void {
    for (const client of this.conns) {
      if (client !== origin && client.readyState === WebSocket.OPEN) {
        this.send(client, message);
      }
    }
  }

  private send(ws: WebSocket, message: Uint8Array): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message, { binary: true });
    }
  }

  private createSyncMessage(update: Uint8Array): Uint8Array {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    return encoding.toUint8Array(encoder);
  }

  private createAwarenessMessage(clients: number[]): Uint8Array {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients)
    );
    return encoding.toUint8Array(encoder);
  }
}
