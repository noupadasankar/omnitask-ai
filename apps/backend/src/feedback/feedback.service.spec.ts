import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  taskFeedback: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('FeedbackService', () => {
  let service: FeedbackService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<FeedbackService>(FeedbackService);
  });

  describe('submit', () => {
    it('should create feedback with rating ONE for value 1', async () => {
      mockPrisma.taskFeedback.create.mockResolvedValue({ id: 'fb-1', rating: 'ONE' });
      const result = await service.submit('user-1', {
        taskId: 'task-1',
        rating: 1,
        comment: 'bad',
        category: 'usability',
      });
      expect(mockPrisma.taskFeedback.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          taskId: 'task-1',
          sessionId: undefined,
          rating: 'ONE',
          comment: 'bad',
          category: 'usability',
        },
      });
      expect(result.id).toBe('fb-1');
    });

    it('should map rating 5 to FIVE', async () => {
      mockPrisma.taskFeedback.create.mockResolvedValue({ id: 'fb-2', rating: 'FIVE' });
      const result = await service.submit('user-1', { rating: 5 });
      expect(mockPrisma.taskFeedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rating: 'FIVE' }),
        }),
      );
      expect(result.rating).toBe('FIVE');
    });

    it('should default category to general', async () => {
      mockPrisma.taskFeedback.create.mockResolvedValue({ id: 'fb-3' });
      await service.submit('user-1', { rating: 3 });
      expect(mockPrisma.taskFeedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ category: 'general' }),
        }),
      );
    });

    it('should accept all valid ratings 1-5', async () => {
      for (const rating of [1, 2, 3, 4, 5] as const) {
        mockPrisma.taskFeedback.create.mockResolvedValue({ id: `fb-${rating}` });
        await service.submit('user-1', { rating });
        const call = mockPrisma.taskFeedback.create.mock.calls.at(-1);
        expect(call[0].data.rating).toBe(['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][rating - 1]);
      }
    });
  });

  describe('list', () => {
    it('should return feedback for user ordered by date desc', async () => {
      const items = [{ id: 'fb-1', rating: 'FIVE' }];
      mockPrisma.taskFeedback.findMany.mockResolvedValue(items);
      const result = await service.list('user-1');
      expect(result).toEqual(items);
      expect(mockPrisma.taskFeedback.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    });

    it('should respect custom limit', async () => {
      mockPrisma.taskFeedback.findMany.mockResolvedValue([]);
      await service.list('user-1', 5);
      expect(mockPrisma.taskFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });

    it('should return empty array when no feedback', async () => {
      mockPrisma.taskFeedback.findMany.mockResolvedValue([]);
      const result = await service.list('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return empty stats when no feedback', async () => {
      mockPrisma.taskFeedback.findMany.mockResolvedValue([]);
      const stats = await service.getStats('user-1');
      expect(stats).toEqual({ total: 0, averageRating: 0, distribution: {}, categoryBreakdown: {} });
    });

    it('should calculate average rating correctly', async () => {
      mockPrisma.taskFeedback.findMany.mockResolvedValue([
        { rating: 'FIVE', category: 'general' },
        { rating: 'THREE', category: 'general' },
      ]);
      const stats = await service.getStats('user-1');
      expect(stats.total).toBe(2);
      expect(stats.averageRating).toBe(4);
    });

    it('should build distribution map', async () => {
      mockPrisma.taskFeedback.findMany.mockResolvedValue([
        { rating: 'FIVE', category: null },
        { rating: 'FIVE', category: null },
        { rating: 'ONE', category: null },
      ]);
      const stats = await service.getStats('user-1');
      expect(stats.distribution).toEqual({ FIVE: 2, ONE: 1 });
    });

    it('should build category breakdown', async () => {
      mockPrisma.taskFeedback.findMany.mockResolvedValue([
        { rating: 'FIVE', category: 'usability' },
        { rating: 'FOUR', category: 'usability' },
        { rating: 'THREE', category: 'performance' },
      ]);
      const stats = await service.getStats('user-1');
      expect(stats.categoryBreakdown).toEqual({ usability: 2, performance: 1 });
    });
  });
});
