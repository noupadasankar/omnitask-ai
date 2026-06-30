import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService, WebhookEvent } from './webhook.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  webhook: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<WebhookService>(WebhookService);
  });

  describe('create', () => {
    it('should create webhook with defaults', async () => {
      mockPrisma.webhook.create.mockResolvedValue({ id: 'wh-1', url: 'https://hook.example.com' });
      const result = await service.create('u1', { url: 'https://hook.example.com', events: ['task.completed'] });
      expect(mockPrisma.webhook.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          url: 'https://hook.example.com',
          secret: undefined,
          events: ['task.completed'],
          retryCount: 3,
          timeoutMs: 10000,
        },
      });
      expect(result.id).toBe('wh-1');
    });

    it('should accept custom retry and timeout', async () => {
      mockPrisma.webhook.create.mockResolvedValue({ id: 'wh-2' });
      await service.create('u1', { url: 'https://hook.example.com', events: [], retryCount: 5, timeoutMs: 30000 });
      expect(mockPrisma.webhook.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ retryCount: 5, timeoutMs: 30000 }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return non-deleted webhooks for user', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([{ id: 'wh-1' }]);
      const result = await service.findAll('u1');
      expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should find webhook by id and user', async () => {
      mockPrisma.webhook.findFirst.mockResolvedValue({ id: 'wh-1', url: 'https://hook.example.com' });
      const result = await service.findOne('u1', 'wh-1');
      expect(mockPrisma.webhook.findFirst).toHaveBeenCalledWith({
        where: { id: 'wh-1', userId: 'u1', deletedAt: null },
      });
      expect(result).not.toBeNull();
    });

    it('should return null for wrong user', async () => {
      mockPrisma.webhook.findFirst.mockResolvedValue(null);
      const result = await service.findOne('u1', 'wh-other');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update webhook fields', async () => {
      mockPrisma.webhook.findFirst.mockResolvedValue({ id: 'wh-1', url: 'https://old.example.com' });
      mockPrisma.webhook.update.mockResolvedValue({ id: 'wh-1', url: 'https://new.example.com' });
      const result = await service.update('u1', 'wh-1', { url: 'https://new.example.com' });
      expect(mockPrisma.webhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: { url: 'https://new.example.com' },
      });
      expect(result!.url).toBe('https://new.example.com');
    });

    it('should return null when webhook not found', async () => {
      mockPrisma.webhook.findFirst.mockResolvedValue(null);
      const result = await service.update('u1', 'wh-missing', { url: 'https://x.com' });
      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('should soft-delete webhook with timestamp', async () => {
      mockPrisma.webhook.findFirst.mockResolvedValue({ id: 'wh-1' });
      mockPrisma.webhook.update.mockResolvedValue({ id: 'wh-1', deletedAt: new Date() });
      const result = await service.remove('u1', 'wh-1');
      expect(mockPrisma.webhook.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      expect(result).not.toBeNull();
    });

    it('should return null for non-existent webhook', async () => {
      mockPrisma.webhook.findFirst.mockResolvedValue(null);
      const result = await service.remove('u1', 'wh-ghost');
      expect(result).toBeNull();
    });
  });

  describe('deliver', () => {
    const event: WebhookEvent = { event: 'task.completed', userId: 'u1', payload: { taskId: 't1' }, timestamp: new Date().toISOString() };

    it('should skip when no matching webhooks', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([]);
      await service.deliver(event);
      expect(mockPrisma.webhook.findMany).toHaveBeenCalled();
      expect(mockPrisma.webhook.update).not.toHaveBeenCalled();
    });

    it('should deliver to matching webhook and mark success', async () => {
      const webhook = { id: 'wh-1', url: 'https://hook.example.com', secret: null, enabled: true, deletedAt: null,
        retryCount: 3, timeoutMs: 10000, events: ['task.completed'] };
      mockPrisma.webhook.findMany.mockResolvedValue([webhook]);
      mockPrisma.webhook.update.mockResolvedValue({});

      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      (global as any).fetch = mockFetch;

      await service.deliver(event);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hook.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );
      expect(mockPrisma.webhook.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastStatus: 'success' }),
        }),
      );
    });

    it('should mark failed after exhausting retries', async () => {
      const webhook = { id: 'wh-2', url: 'https://hook.example.com', secret: null, enabled: true, deletedAt: null,
        retryCount: 2, timeoutMs: 100, events: ['task.completed'] };
      mockPrisma.webhook.findMany.mockResolvedValue([webhook]);
      mockPrisma.webhook.update.mockResolvedValue({});

      const mockFetch = jest.fn().mockRejectedValue(new Error('Connection refused'));
      (global as any).fetch = mockFetch;

      await service.deliver(event);

      expect(mockPrisma.webhook.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastStatus: 'failed' }),
        }),
      );
    });

    it('should not deliver to user from different userId', async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([]);
      await service.deliver({ ...event, userId: 'other-user' });
      expect(mockPrisma.webhook.update).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should soft-delete old webhooks', async () => {
      mockPrisma.webhook.updateMany.mockResolvedValue({ count: 10 });
      await service.cleanup();
      expect(mockPrisma.webhook.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: { lt: expect.any(Date) } }),
        }),
      );
    });
  });
});
