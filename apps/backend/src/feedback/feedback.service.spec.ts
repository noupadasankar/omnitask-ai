import { FeedbackService } from './feedback.service';
import type { FeedbackRepository } from './feedback.repository';

const mockRepo: jest.Mocked<Pick<FeedbackRepository, 'create' | 'findByUser' | 'findAllForStats'>> = {
  create: jest.fn(),
  findByUser: jest.fn(),
  findAllForStats: jest.fn(),
};

describe('FeedbackService', () => {
  let service: FeedbackService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeedbackService(mockRepo as unknown as FeedbackRepository);
  });

  describe('submit', () => {
    it('should create feedback with rating ONE for value 1', async () => {
      mockRepo.create.mockResolvedValue({ id: 'fb-1', rating: 'ONE' } as any);
      const result = await service.submit('user-1', {
        taskId: 'task-1',
        rating: 1,
        comment: 'bad',
        category: 'usability',
      });
      expect(mockRepo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        taskId: 'task-1',
        sessionId: undefined,
        rating: 'ONE',
        comment: 'bad',
        category: 'usability',
      });
      expect(result.id).toBe('fb-1');
    });

    it('should map rating 5 to FIVE', async () => {
      mockRepo.create.mockResolvedValue({ id: 'fb-2', rating: 'FIVE' } as any);
      const result = await service.submit('user-1', { rating: 5 } as any);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ rating: 'FIVE' }),
      );
      expect(result.rating).toBe('FIVE');
    });

    it('should default category to general', async () => {
      mockRepo.create.mockResolvedValue({ id: 'fb-3' } as any);
      await service.submit('user-1', { rating: 3 } as any);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'general' }),
      );
    });

    it('should accept all valid ratings 1-5', async () => {
      for (const rating of [1, 2, 3, 4, 5] as const) {
        mockRepo.create.mockResolvedValue({ id: `fb-${rating}` } as any);
        await service.submit('user-1', { rating } as any);
        const call = mockRepo.create.mock.calls.at(-1);
        expect(call![0].rating).toBe(['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][rating - 1]);
      }
    });
  });

  describe('list', () => {
    it('should return feedback for user ordered by date desc', async () => {
      const items = [{ id: 'fb-1', rating: 'FIVE' }];
      mockRepo.findByUser.mockResolvedValue(items as any);
      const result = await service.list('user-1');
      expect(result).toEqual(items);
      expect(mockRepo.findByUser).toHaveBeenCalledWith('user-1', 20);
    });

    it('should respect custom limit', async () => {
      mockRepo.findByUser.mockResolvedValue([]);
      await service.list('user-1', 5);
      expect(mockRepo.findByUser).toHaveBeenCalledWith('user-1', 5);
    });

    it('should return empty array when no feedback', async () => {
      mockRepo.findByUser.mockResolvedValue([]);
      const result = await service.list('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return empty stats when no feedback', async () => {
      mockRepo.findAllForStats.mockResolvedValue([]);
      const stats = await service.getStats('user-1');
      expect(stats).toEqual({ total: 0, averageRating: 0, distribution: {}, categoryBreakdown: {} });
    });

    it('should calculate average rating correctly', async () => {
      mockRepo.findAllForStats.mockResolvedValue([
        { rating: 'FIVE', category: 'general' },
        { rating: 'THREE', category: 'general' },
      ] as any);
      const stats = await service.getStats('user-1');
      expect(stats.total).toBe(2);
      expect(stats.averageRating).toBe(4);
    });

    it('should build distribution map', async () => {
      mockRepo.findAllForStats.mockResolvedValue([
        { rating: 'FIVE', category: null },
        { rating: 'FIVE', category: null },
        { rating: 'ONE', category: null },
      ] as any);
      const stats = await service.getStats('user-1');
      expect(stats.distribution).toEqual({ FIVE: 2, ONE: 1 });
    });

    it('should build category breakdown', async () => {
      mockRepo.findAllForStats.mockResolvedValue([
        { rating: 'FIVE', category: 'usability' },
        { rating: 'FOUR', category: 'usability' },
        { rating: 'THREE', category: 'performance' },
      ] as any);
      const stats = await service.getStats('user-1');
      expect(stats.categoryBreakdown).toEqual({ usability: 2, performance: 1 });
    });
  });
});
