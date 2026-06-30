import { Test, TestingModule } from '@nestjs/testing';
import { AgentMessageBusService } from './message-bus.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

const mockEventEmitter = {
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  removeAllListeners: jest.fn(),
};

describe('AgentMessageBusService', () => {
  let service: AgentMessageBusService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentMessageBusService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
    service = module.get<AgentMessageBusService>(AgentMessageBusService);
  });

  describe('publish', () => {
    it('should create a message with id and timestamp', async () => {
      const msg = await service.publish('test', { data: 1 });

      expect(msg.id).toMatch(/^msg-\d+-\d+$/);
      expect(msg.timestamp).toBeDefined();
      expect(msg.channel).toBe('test');
      expect(msg.from).toBe('system');
      expect(msg.payload).toEqual({ data: 1 });
    });

    it('should emit event to EventEmitter', async () => {
      await service.publish('test', { data: 1 });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith('test', expect.objectContaining({
        channel: 'test',
        payload: { data: 1 },
      }));
    });

    it('should invoke registered subscribers', async () => {
      const handler = jest.fn();
      service.subscribe('test', handler);

      await service.publish('test', { data: 1 });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'test',
        payload: { data: 1 },
      }));
    });

    it('should not invoke subscribers from other channels', async () => {
      const handler = jest.fn();
      service.subscribe('other', handler);

      await service.publish('test', { data: 1 });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should infer type from payload', async () => {
      const msg = await service.publish('test', { type: 'custom_event', data: 1 });
      expect(msg.type).toBe('custom_event');
    });

    it('should use default type event when payload has no type', async () => {
      const msg = await service.publish('test', 'string_payload');
      expect(msg.type).toBe('event');
    });
  });

  describe('subscribe', () => {
    it('should register a handler and return unsubscribe function', () => {
      const handler = jest.fn();
      const unsub = service.subscribe('test', handler);

      expect(mockEventEmitter.on).toHaveBeenCalledWith('test', handler);
      expect(typeof unsub).toBe('function');
    });

    it('should unsubscribe handler when called', () => {
      const handler = jest.fn();
      const unsub = service.subscribe('test', handler);

      unsub();

      expect(mockEventEmitter.off).toHaveBeenCalledWith('test', handler);
    });

    it('should handle subscriber errors gracefully', async () => {
      const handler = jest.fn().mockImplementation(() => { throw new Error('handler error'); });
      service.subscribe('test', handler);

      await expect(service.publish('test', { data: 1 })).resolves.toBeDefined();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('request', () => {
    it('should return reply message within timeout', async () => {
      const handler = jest.fn();
      service.subscribe('test', handler);

      const promise = service.request('test', { query: 'hello' });

      const publishCall = mockEventEmitter.emit.mock.calls.find(c => c[0] === 'test');
      const sentMsg = publishCall?.[1] as any;

      const replyPayload = { result: 'world' };
      await service.reply(sentMsg, replyPayload);

      const result = await promise;
      expect(result).toBeDefined();
      expect(result!.payload).toEqual(replyPayload);
    });

    it('should return null on timeout', async () => {
      const result = await service.request('timeout_channel', {}, 50);
      expect(result).toBeNull();
    }, 10000);
  });

  describe('reply', () => {
    it('should publish on reply channel', async () => {
      const original: any = {
        id: 'msg-1',
        channel: 'request_channel',
        replyTo: undefined,
        from: 'requester',
        to: undefined,
      };

      await service.reply(original, { result: 'ok' });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'request_channel:reply',
        expect.objectContaining({ payload: { result: 'ok' } }),
      );
    });

    it('should use explicit replyTo if available', async () => {
      const original: any = {
        id: 'msg-2',
        channel: 'req',
        replyTo: 'custom:reply',
        from: 'requester',
        to: 'responder',
      };

      await service.reply(original, { result: 'ok' });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'custom:reply',
        expect.objectContaining({ payload: { result: 'ok' } }),
      );
    });
  });

  describe('broadcast', () => {
    it('should publish with from=broadcast', async () => {
      await service.broadcast('alert', { message: 'system down' });

      const emitCall = mockEventEmitter.emit.mock.calls.find(c => c[0] === 'alert');
      expect(emitCall).toBeDefined();
      expect((emitCall![1] as any).from).toBe('broadcast');
    });
  });

  describe('subscribeToAll', () => {
    it('should subscribe to multiple channels', () => {
      const handlers = [
        { channel: 'a', handler: jest.fn() },
        { channel: 'b', handler: jest.fn() },
      ];

      const unsubs = service.subscribeToAll(handlers);

      expect(mockEventEmitter.on).toHaveBeenCalledTimes(2);
      expect(unsubs).toHaveLength(2);
    });
  });

  describe('countMessages', () => {
    it('should count subscribers matching pattern', async () => {
      service.subscribe('agent:step', jest.fn());
      service.subscribe('agent:plan', jest.fn());
      service.subscribe('user:login', jest.fn());

      const count = await service.countMessages('agent:*');
      expect(count).toBe(2);
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear subscribers and event listeners', () => {
      service.subscribe('test', jest.fn());

      service.onModuleDestroy();

      expect(mockEventEmitter.removeAllListeners).toHaveBeenCalled();
    });
  });
});
