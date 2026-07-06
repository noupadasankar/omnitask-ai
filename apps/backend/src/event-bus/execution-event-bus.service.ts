import { Injectable, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExecutionEventMap } from './event-map.interface';

@Injectable()
export class ExecutionEventBus {
  constructor(@Inject(EventEmitter2) private readonly emitter: EventEmitter2) {}

  emit<K extends keyof ExecutionEventMap>(sessionId: string, event: K, payload: ExecutionEventMap[K]): void {
    this.emitter.emit('execution:ws:emit', { sessionId, event, payload });
  }
}
