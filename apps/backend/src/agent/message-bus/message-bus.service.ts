import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface AgentMessage {
  id: string;
  from: string;
  to?: string;
  channel: string;
  type: string;
  payload: unknown;
  timestamp: string;
  replyTo?: string;
}

@Injectable()
export class AgentMessageBusService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentMessageBusService.name);
  private readonly subscribers = new Map<string, Set<(msg: AgentMessage) => void>>();
  private messageCounter = 0;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  async publish(channel: string, payload: unknown, from = 'system', to?: string): Promise<AgentMessage> {
    this.messageCounter++;
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${this.messageCounter}`,
      from,
      to,
      channel,
      type: payload && typeof payload === 'object' ? (payload as any).type || 'event' : 'event',
      payload,
      timestamp: new Date().toISOString(),
    };

    this.eventEmitter.emit(channel, message);

    const subs = this.subscribers.get(channel);
    if (subs) {
      for (const handler of subs) {
        try { handler(message); } catch (err) { this.logger.error(`Subscriber error on ${channel}: ${err}`); }
      }
    }

    this.logger.debug(`Published to ${channel}: ${message.id}`);
    return message;
  }

  subscribe(channel: string, handler: (msg: AgentMessage) => void): () => void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel)!.add(handler);

    this.eventEmitter.on(channel, handler);

    return () => {
      this.subscribers.get(channel)?.delete(handler);
      this.eventEmitter.off(channel, handler);
    };
  }

  async request(channel: string, payload: unknown, timeoutMs = 10000): Promise<AgentMessage | null> {
    return new Promise((resolve) => {
      const replyChannel = `${channel}:reply`;
      const timer = setTimeout(() => resolve(null), timeoutMs);

      const unsub = this.subscribe(replyChannel, (msg) => {
        clearTimeout(timer);
        unsub();
        resolve(msg);
      });

      this.publish(channel, payload, 'request', undefined);
    });
  }

  async reply(original: AgentMessage, payload: unknown): Promise<void> {
    const replyChannel = original.replyTo || `${original.channel}:reply`;
    await this.publish(replyChannel, payload, original.to || 'system', original.from);
  }

  async broadcast(channel: string, payload: unknown): Promise<void> {
    await this.publish(channel, payload, 'broadcast');
  }

  subscribeToAll(handlers: { channel: string; handler: (msg: AgentMessage) => void }[]): (() => void)[] {
    return handlers.map(({ channel, handler }) => this.subscribe(channel, handler));
  }

  async countMessages(pattern: string): Promise<number> {
    let count = 0;
    for (const channel of this.subscribers.keys()) {
      if (channel.includes(pattern.replace('*', ''))) {
        count++;
      }
    }
    return count;
  }

  onModuleDestroy() {
    this.subscribers.clear();
    this.eventEmitter.removeAllListeners();
  }
}
