import { Test, TestingModule } from '@nestjs/testing';
import { MemoryService } from './memory.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  memory: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('MemoryService', () => {
  let service: MemoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<MemoryService>(MemoryService);
  });

  describe('store', () => {
    it('should store memory with default importance 0.5', async () => {
      mockPrisma.memory.create.mockResolvedValue({ id: 'm1', content: 'test', importance: 0.5 });
      await service.store('u1', 'test memory', 'EPISODIC');
      expect(mockPrisma.memory.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', content: 'test memory', type: 'EPISODIC', importance: 0.5 }),
      }));
    });

    it('should store with custom importance', async () => {
      mockPrisma.memory.create.mockResolvedValue({ id: 'm2', importance: 0.9 });
      await service.store('u1', 'important', 'SEMANTIC', { importance: 0.9 });
      expect(mockPrisma.memory.create.mock.calls[0][0].data.importance).toBe(0.9);
    });

    it('should store with taskId', async () => {
      mockPrisma.memory.create.mockResolvedValue({ id: 'm3' });
      await service.store('u1', 'task memory', 'EPISODIC', { taskId: 't1' });
      expect(mockPrisma.memory.create.mock.calls[0][0].data.taskId).toBe('t1');
    });

    it('should store with summary', async () => {
      mockPrisma.memory.create.mockResolvedValue({ id: 'm4' });
      await service.store('u1', 'long content', 'EPISODIC', { summary: 'brief' });
      expect(mockPrisma.memory.create.mock.calls[0][0].data.summary).toBe('brief');
    });

    it('should store with metadata', async () => {
      mockPrisma.memory.create.mockResolvedValue({ id: 'm5' });
      await service.store('u1', 'meta', 'SEMANTIC', { metadata: { source: 'test', score: 0.8 } });
      expect(mockPrisma.memory.create.mock.calls[0][0].data.metadata).toEqual({ source: 'test', score: 0.8 });
    });

    it('should return the created memory', async () => {
      mockPrisma.memory.create.mockResolvedValue({ id: 'm6', content: 'return test' });
      const result = await service.store('u1', 'return test', 'EPISODIC');
      expect(result).toEqual({ id: 'm6', content: 'return test' });
    });
  });

  describe('retrieveRelevant', () => {
    it('should search by content and summary', async () => {
      mockPrisma.memory.findMany.mockResolvedValue([]);
      await service.retrieveRelevant('u1', 'query');
      expect(mockPrisma.memory.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { content: { contains: 'query', mode: 'insensitive' } },
            { summary: { contains: 'query', mode: 'insensitive' } },
          ],
        }),
      }));
    });

    it('should filter by type if provided', async () => {
      mockPrisma.memory.findMany.mockResolvedValue([]);
      await service.retrieveRelevant('u1', 'q', { type: 'EPISODIC' });
      expect(mockPrisma.memory.findMany.mock.calls[0][0].where.type).toBe('EPISODIC');
    });

    it('should default limit to 10', async () => {
      mockPrisma.memory.findMany.mockResolvedValue([]);
      await service.retrieveRelevant('u1', 'q');
      expect(mockPrisma.memory.findMany.mock.calls[0][0].take).toBe(10);
    });

    it('should respect custom limit', async () => {
      mockPrisma.memory.findMany.mockResolvedValue([]);
      await service.retrieveRelevant('u1', 'q', { limit: 5 });
      expect(mockPrisma.memory.findMany.mock.calls[0][0].take).toBe(5);
    });

    it('should order by createdAt desc', async () => {
      mockPrisma.memory.findMany.mockResolvedValue([]);
      await service.retrieveRelevant('u1', 'q');
      expect(mockPrisma.memory.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('getRecent', () => {
    it('should return recent memories for user', async () => {
      mockPrisma.memory.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
      const result = await service.getRecent('u1');
      expect(result).toHaveLength(2);
    });

    it('should default to 10 items', async () => {
      mockPrisma.memory.findMany.mockResolvedValue([]);
      await service.getRecent('u1');
      expect(mockPrisma.memory.findMany.mock.calls[0][0].take).toBe(10);
    });

    it('should accept custom limit', async () => {
      mockPrisma.memory.findMany.mockResolvedValue([]);
      await service.getRecent('u1', 3);
      expect(mockPrisma.memory.findMany.mock.calls[0][0].take).toBe(3);
    });
  });

  describe('getRecentPaginated', () => {
    it('should paginate with cursor', async () => {
      mockPrisma.memory.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
      const result = await service.getRecentPaginated('u1', undefined, 2);
      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('should set hasMore true when more items exist', async () => {
      mockPrisma.memory.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]);
      const result = await service.getRecentPaginated('u1', undefined, 2);
      expect(result.hasMore).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should generate nextCursor when hasMore', async () => {
      mockPrisma.memory.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]);
      const result = await service.getRecentPaginated('u1', undefined, 2);
      expect(result.nextCursor).toBeTruthy();
    });

    it('should skip cursor item if provided', async () => {
      const cursor = Buffer.from('m1').toString('base64url');
      mockPrisma.memory.findMany.mockResolvedValue([{ id: 'm2' }, { id: 'm3' }]);
      await service.getRecentPaginated('u1', cursor, 2);
      expect(mockPrisma.memory.findMany.mock.calls[0][0].skip).toBe(1);
    });

    it('should cap take at 100', async () => {
      mockPrisma.memory.findMany.mockResolvedValue([]);
      await service.getRecentPaginated('u1', undefined, 500);
      expect(mockPrisma.memory.findMany.mock.calls[0][0].take).toBe(101); // pageSize + 1 with pageSize capped at 100
    });
  });
});
