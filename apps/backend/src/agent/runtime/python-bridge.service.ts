import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as Redis from 'ioredis';

/** Redis list the Python Playwright engine BRPOPs jobs from. */
export const PY_JOB_LIST = 'omnitask:py:jobs';
/** Heartbeat key the Python engine SETs (EX 10) while alive. */
export const PY_ALIVE_KEY = 'omnitask:py:alive';

/**
 * Thin Redis bridge to the standalone Python Playwright browser engine.
 *
 * The Python service cannot consume BullMQ (bull v4 stores jobs in Redis
 * structures that have no clean Python client), so instead the backend pushes a
 * plain-JSON job onto a Redis list and the Python process BRPOPs it. The Python
 * engine then publishes events back on the existing `omnitask:worker:events`
 * channel, which WorkerEventRelayService already relays to the socket + DB.
 */
@Injectable()
export class PythonBridgeService implements OnModuleDestroy {
  private readonly logger = new Logger(PythonBridgeService.name);
  private readonly client: Redis.Redis;

  constructor() {
    this.client = new Redis.Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
    });
    this.client.connect().catch(() => {
      this.logger.warn('Python bridge Redis connect failed — Python dispatch disabled');
    });
  }

  /** True when the Python engine has refreshed its heartbeat key recently. */
  async isAlive(): Promise<boolean> {
    try {
      return (await this.client.get(PY_ALIVE_KEY)) !== null;
    } catch {
      return false;
    }
  }

  /** Enqueue a browser job for the Python engine. */
  async dispatch(job: Record<string, any>): Promise<void> {
    await this.client.lpush(PY_JOB_LIST, JSON.stringify(job));
  }

  /**
   * Request a cooperative stop for a running session. The Python engine polls
   * `omnitask:job:cancel:<sessionId>` between candidates and halts when set.
   */
  async cancel(sessionId: string): Promise<void> {
    await this.client.set(`omnitask:job:cancel:${sessionId}`, '1', 'EX', 600);
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      // ignore shutdown errors
    }
  }
}
