import { AbTestingService } from './ab-testing.service';
import type { AbTestingRepository } from './ab-testing.repository';
import type { StrategyTestRecord } from './ab-testing.model';

const baseTest: StrategyTestRecord = {
  id: 'test-1',
  userId: 'user-1',
  name: 'Test A/B',
  description: null,
  strategyA: {},
  strategyB: {},
  status: 'active',
  winner: null,
  totalRunsA: 0,
  totalRunsB: 0,
  successA: 0,
  successB: 0,
  avgDurationA: 0,
  avgDurationB: 0,
  startedAt: new Date(),
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRepo: jest.Mocked<
  Pick<
    AbTestingRepository,
    'createTest' | 'findTest' | 'listActiveByUser' | 'applyRun' | 'declareWinner'
  >
> = {
  createTest: jest.fn(),
  findTest: jest.fn(),
  listActiveByUser: jest.fn(),
  applyRun: jest.fn(),
  declareWinner: jest.fn(),
};

describe('AbTestingService', () => {
  let service: AbTestingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AbTestingService(mockRepo as unknown as AbTestingRepository);
  });

  describe('createTest', () => {
    it('should delegate to repo.createTest and return an active test', async () => {
      const dto = { name: 'My Test', strategyA: { x: 1 }, strategyB: { x: 2 } };
      mockRepo.createTest.mockResolvedValue({ ...baseTest, ...dto });
      const result = await service.createTest('user-1', dto);
      expect(mockRepo.createTest).toHaveBeenCalledWith('user-1', dto);
      expect(result.status).toBe('active');
    });
  });

  describe('recordRun', () => {
    it('should return null if test not found', async () => {
      mockRepo.findTest.mockResolvedValue(null);
      const result = await service.recordRun('bad-id', {
        variant: 'A',
        success: true,
        durationMs: 100,
      });
      expect(result).toBeNull();
      expect(mockRepo.applyRun).not.toHaveBeenCalled();
    });

    it('should return null if test is not active', async () => {
      mockRepo.findTest.mockResolvedValue({ ...baseTest, status: 'completed' });
      const result = await service.recordRun('test-1', {
        variant: 'A',
        success: true,
        durationMs: 100,
      });
      expect(result).toBeNull();
      expect(mockRepo.applyRun).not.toHaveBeenCalled();
    });

    it('should apply the run to variant A fields and mark success', async () => {
      mockRepo.findTest.mockResolvedValue({ ...baseTest });
      mockRepo.applyRun.mockResolvedValue({ ...baseTest, totalRunsA: 1, successA: 1 });
      await service.recordRun('test-1', { variant: 'A', success: true, durationMs: 200 });
      expect(mockRepo.applyRun).toHaveBeenCalledWith('test-1', {
        runField: 'totalRunsA',
        successField: 'successA',
        durationField: 'avgDurationA',
        newAvgDuration: 200,
        incrementSuccess: true,
      });
    });

    it('should apply the run to variant B fields and not mark success on failure', async () => {
      mockRepo.findTest.mockResolvedValue({ ...baseTest });
      mockRepo.applyRun.mockResolvedValue({ ...baseTest, totalRunsB: 1 });
      await service.recordRun('test-1', { variant: 'B', success: false, durationMs: 150 });
      expect(mockRepo.applyRun).toHaveBeenCalledWith('test-1', {
        runField: 'totalRunsB',
        successField: 'successB',
        durationField: 'avgDurationB',
        newAvgDuration: 150,
        incrementSuccess: false,
      });
    });

    it('should recompute the running average duration when prior runs exist', async () => {
      mockRepo.findTest.mockResolvedValue({ ...baseTest, avgDurationA: 100, totalRunsA: 2 });
      mockRepo.applyRun.mockResolvedValue({ ...baseTest });
      await service.recordRun('test-1', { variant: 'A', success: true, durationMs: 200 });
      // (100 * 2 + 200) / (2 + 1) = 166.666...
      expect(mockRepo.applyRun).toHaveBeenCalledWith(
        'test-1',
        expect.objectContaining({ newAvgDuration: (100 * 2 + 200) / 3 }),
      );
    });

    it('should use the raw duration as the average for the first run', async () => {
      mockRepo.findTest.mockResolvedValue({ ...baseTest, avgDurationA: 0, totalRunsA: 0 });
      mockRepo.applyRun.mockResolvedValue({ ...baseTest });
      await service.recordRun('test-1', { variant: 'A', success: true, durationMs: 175 });
      expect(mockRepo.applyRun).toHaveBeenCalledWith(
        'test-1',
        expect.objectContaining({ newAvgDuration: 175 }),
      );
    });

    it('should return the record produced by applyRun', async () => {
      mockRepo.findTest.mockResolvedValue({ ...baseTest });
      const updated = { ...baseTest, totalRunsA: 1 };
      mockRepo.applyRun.mockResolvedValue(updated);
      const result = await service.recordRun('test-1', {
        variant: 'A',
        success: true,
        durationMs: 100,
      });
      expect(result).toBe(updated);
    });
  });

  describe('getResults', () => {
    it('should return null for a non-existent test', async () => {
      mockRepo.findTest.mockResolvedValue(null);
      const result = await service.getResults('bad-id');
      expect(result).toBeNull();
    });

    it('should calculate success rates (80% / 50%)', async () => {
      mockRepo.findTest.mockResolvedValue({
        ...baseTest,
        totalRunsA: 10,
        successA: 8,
        totalRunsB: 10,
        successB: 5,
      });
      const result = await service.getResults('test-1');
      expect(result!.variantA.successRate).toBe(80);
      expect(result!.variantB.successRate).toBe(50);
    });

    it('should return 0 rates when there are no runs (0 / 0)', async () => {
      mockRepo.findTest.mockResolvedValue({ ...baseTest });
      const result = await service.getResults('test-1');
      expect(result!.variantA.successRate).toBe(0);
      expect(result!.variantB.successRate).toBe(0);
    });
  });

  describe('listActive', () => {
    it('should delegate to repo.listActiveByUser', async () => {
      mockRepo.listActiveByUser.mockResolvedValue([baseTest]);
      const result = await service.listActive('user-1');
      expect(mockRepo.listActiveByUser).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('checkWinner', () => {
    it('should not declare a winner before 10 runs per variant', async () => {
      const test = { ...baseTest, totalRunsA: 5, totalRunsB: 5 };
      await (service as any).checkWinner('test-1', test);
      expect(mockRepo.declareWinner).not.toHaveBeenCalled();
    });

    it('should declare A the winner when rateA exceeds rateB by more than 15%', async () => {
      const test = {
        ...baseTest,
        name: 'Win Test',
        totalRunsA: 20,
        successA: 18,
        totalRunsB: 20,
        successB: 10,
      };
      await (service as any).checkWinner('test-1', test);
      expect(mockRepo.declareWinner).toHaveBeenCalledWith('test-1', 'A');
    });

    it('should not declare a winner when the difference is within 15%', async () => {
      const test = {
        ...baseTest,
        totalRunsA: 20,
        successA: 12,
        totalRunsB: 20,
        successB: 11,
      };
      await (service as any).checkWinner('test-1', test);
      expect(mockRepo.declareWinner).not.toHaveBeenCalled();
    });
  });

  describe('calculateSignificance', () => {
    it('should return 0 when a sample size is < 5', () => {
      const result = (service as any).calculateSignificance(3, 80, 4, 60);
      expect(result).toBe(0);
    });

    it('should return a value between 0 and 1 for adequate samples', () => {
      const result = (service as any).calculateSignificance(50, 85, 50, 60);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should return 0 when the standard error is 0', () => {
      const result = (service as any).calculateSignificance(10, 100, 10, 100);
      expect(result).toBe(0);
    });
  });
});
