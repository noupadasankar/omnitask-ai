import { Test, TestingModule } from '@nestjs/testing';
import { MemoryStoreService } from './memory-store.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../common/embedding/embedding.service';

function makeVector(start: number, dim = 4): number[] {
  return Array.from({ length: dim }, (_, i) => start + i * 0.1);
}

const mockEmbeddingService = {
  generateEmbedding: jest.fn(),
  cosineSimilarity: jest.fn(),
};

describe('MemoryStoreService', () => {
  let service: MemoryStoreService;
  let prisma: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEmbeddingService.generateEmbedding.mockResolvedValue(makeVector(0));
    mockEmbeddingService.cosineSimilarity.mockReturnValue(0.9);
    prisma = {
      agentMemory: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryStoreService,
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<MemoryStoreService>(MemoryStoreService);
  });

  describe('store', () => {
    it('should store memory with embedding and defaults', async () => {
      prisma.agentMemory.create.mockResolvedValue({ id: 'mem-1' });

      await service.store('user-1', 'EPISODIC', 'task:1', 'Content', 0.8);

      expect(prisma.agentMemory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'EPISODIC',
          key: 'task:1',
          content: 'Content',
          importance: 0.8,
          accessCount: 0,
        }),
      });
    });

    it('should set expiresAt when expiresInDays provided', async () => {
      prisma.agentMemory.create.mockResolvedValue({ id: 'mem-1' });

      await service.store('user-1', 'EPISODIC', 'key', 'content', 0.5, 30);

      const callArg = prisma.agentMemory.create.mock.calls[0][0];
      expect(callArg.data.expiresAt).toBeInstanceOf(Date);
    });

    it('should handle DB errors gracefully', async () => {
      prisma.agentMemory.create.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.store('user-1', 'EPISODIC', 'key', 'content')).resolves.toBeUndefined();
    });

    it('should handle embedding failure gracefully', async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValueOnce(new Error('API error'));

      await expect(service.store('user-1', 'EPISODIC', 'key', 'content')).resolves.toBeUndefined();
    });
  });

  describe('recall', () => {
    it('should return empty array on DB failure', async () => {
      prisma.agentMemory.findMany.mockRejectedValueOnce(new Error('DB error'));

      const result = await service.recall('user-1', 'query');
      expect(result).toEqual([]);
    });

    it('should return empty array when no memories found', async () => {
      prisma.agentMemory.findMany.mockResolvedValue([]);

      const result = await service.recall('user-1', 'query');
      expect(result).toEqual([]);
    });

    it('should filter by type when provided', async () => {
      prisma.agentMemory.findMany.mockResolvedValue([]);

      await service.recall('user-1', 'query', { type: 'EPISODIC' });
      expect(prisma.agentMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'EPISODIC' }),
        }),
      );
    });

    it('should filter out memories below similarity threshold', async () => {
      prisma.agentMemory.findMany.mockResolvedValue([
        { id: 'm1', key: 'task:1', content: 'Content A', embedding: makeVector(0.05), importance: 0.8, type: 'EPISODIC', metadata: {}, createdAt: new Date(), updatedAt: new Date(), userId: 'user-1', accessCount: 0, lastAccessedAt: new Date(), expiresAt: null },
        { id: 'm2', key: 'task:2', content: 'Content B', embedding: makeVector(10), importance: 0.9, type: 'EPISODIC', metadata: {}, createdAt: new Date(), updatedAt: new Date(), userId: 'user-1', accessCount: 0, lastAccessedAt: new Date(), expiresAt: null },
      ]);
      prisma.agentMemory.update.mockResolvedValue({});
      let callCount = 0;
      mockEmbeddingService.cosineSimilarity.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 0.9 : 0.1; // first record passes, second does not
      });

      const result = await service.recall('user-1', 'test query', { limit: 10, similarityThreshold: 0.5 });

      expect(result).toHaveLength(1);
      expect(result[0].importance).toBe(0.8); // whichever fixture has importance 0.8
    });

    it('should update accessCount and lastAccessedAt on recalled memories', async () => {
      prisma.agentMemory.findMany.mockResolvedValue([
        { id: 'm1', key: 'task:1', content: 'Content', embedding: makeVector(0.05), importance: 0.9, type: 'EPISODIC', metadata: {}, createdAt: new Date(), updatedAt: new Date(), userId: 'user-1', accessCount: 0, lastAccessedAt: new Date(), expiresAt: null },
      ]);
      prisma.agentMemory.update.mockResolvedValue({});

      await service.recall('user-1', 'query');

      expect(prisma.agentMemory.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { accessCount: { increment: 1 }, lastAccessedAt: expect.any(Date) },
      });
    });

    it('should handle embedding failure gracefully', async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValueOnce(new Error('API error'));

      const result = await service.recall('user-1', 'query');
      expect(result).toEqual([]);
    });
  });

  describe('working memory', () => {
    it('should store and retrieve working memory', () => {
      service.storeWorking('key1', { data: 'value1' });
      expect(service.getWorking('key1')).toEqual({ data: 'value1' });
    });

    it('should return undefined for missing key', () => {
      expect(service.getWorking('nonexistent')).toBeUndefined();
    });

    it('should return all working memory', () => {
      service.storeWorking('a', 1);
      service.storeWorking('b', 2);
      const all = service.getAllWorking();
      expect(all).toEqual({ a: 1, b: 2 });
    });

    it('should clear specific key', () => {
      service.storeWorking('a', 1);
      service.storeWorking('b', 2);
      service.clearWorking('a');
      expect(service.getWorking('a')).toBeUndefined();
      expect(service.getWorking('b')).toBe(2);
    });

    it('should clear all working memory', () => {
      service.storeWorking('a', 1);
      service.storeWorking('b', 2);
      service.clearWorking();
      expect(service.getAllWorking()).toEqual({});
    });
  });

  describe('storeExecutionEpisode', () => {
    it('should store episode with success importance (0.8)', async () => {
      prisma.agentMemory.create.mockResolvedValue({ id: 'mem-1' });

      await service.storeExecutionEpisode('user-1', 'Test goal', [{ action: 'navigate', target: 'https://x.com' }], true, 5000);

      const callArg = prisma.agentMemory.create.mock.calls[0][0];
      expect(callArg.data.type).toBe('EPISODIC');
      expect(callArg.data.importance).toBe(0.8);
      expect(callArg.data.expiresAt).toBeDefined();
    });

    it('should store episode with failure importance (0.5)', async () => {
      prisma.agentMemory.create.mockResolvedValue({ id: 'mem-1' });

      await service.storeExecutionEpisode('user-1', 'Test goal', [], false, 1000);

      const callArg = prisma.agentMemory.create.mock.calls[0][0];
      expect(callArg.data.importance).toBe(0.5);
    });
  });

  describe('storeLearning', () => {
    it('should store SEMANTIC memory with given importance', async () => {
      prisma.agentMemory.create.mockResolvedValue({ id: 'mem-1' });

      await service.storeLearning('user-1', 'topic', 'learned content', 0.9);

      expect(prisma.agentMemory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'SEMANTIC',
          key: 'topic',
          content: 'learned content',
          importance: 0.9,
        }),
      });
    });
  });

  describe('storeProcedure', () => {
    it('should store PROCEDURAL memory with join on steps', async () => {
      prisma.agentMemory.create.mockResolvedValue({ id: 'mem-1' });

      await service.storeProcedure('user-1', 'login-flow', ['step 1', 'step 2', 'step 3']);

      expect(prisma.agentMemory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'PROCEDURAL',
          key: 'login-flow',
          content: 'step 1\nstep 2\nstep 3',
          importance: 0.9,
        }),
      });
    });
  });
});
