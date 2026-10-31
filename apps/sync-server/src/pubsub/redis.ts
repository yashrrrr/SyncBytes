import { Redis } from 'ioredis';
import { config } from '../config.js';

export class RedisPubSub {
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private subscriptions: Map<string, (channel: string, message: Buffer) => void> = new Map();
  private isConnected = false;

  constructor() {
    try {
      this.pubClient = new Redis(config.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        retryStrategy: () => null, // Don't retry / crash if redis is offline locally
      });

      this.subClient = new Redis(config.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });

      // Attach error handlers immediately to prevent Node EventEmitter unhandled exceptions
      this.pubClient.on('error', () => {
        this.isConnected = false;
      });
      this.subClient.on('error', () => {
        this.isConnected = false;
      });

      this.init();
    } catch {
      console.warn('[Redis] Redis not available, running in standalone mode.');
    }
  }

  private async init() {
    if (!this.pubClient || !this.subClient) return;

    try {
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
      this.isConnected = true;
      console.log('[Redis] Connected to Redis Pub/Sub successfully.');

      this.subClient.on('messageBuffer', (channelBuffer, messageBuffer) => {
        const channel = channelBuffer.toString();
        const handler = this.subscriptions.get(channel);
        if (handler) {
          handler(channel, messageBuffer);
        }
      });
    } catch {
      this.isConnected = false;
      console.log('[Redis] Running in local standalone mode without Redis cluster sync.');
    }
  }

  public async publish(channel: string, message: Uint8Array): Promise<void> {
    if (!this.isConnected || !this.pubClient) return;
    try {
      await this.pubClient.publish(channel, Buffer.from(message));
    } catch {
      // Redis offline; local broadcast still succeeds
    }
  }

  public async subscribe(
    channel: string,
    handler: (channel: string, message: Buffer) => void
  ): Promise<void> {
    this.subscriptions.set(channel, handler);
    if (this.isConnected && this.subClient) {
      try {
        await this.subClient.subscribe(channel);
      } catch {
        // Fallback to local
      }
    }
  }

  public async unsubscribe(channel: string): Promise<void> {
    this.subscriptions.delete(channel);
    if (this.isConnected && this.subClient) {
      try {
        await this.subClient.unsubscribe(channel);
      } catch {
        // Fallback to local
      }
    }
  }
}

export const pubsub = new RedisPubSub();
