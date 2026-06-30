import { Test, TestingModule } from '@nestjs/testing';
import { AbTestingService } from './ab-testing.service';
import { PrismaService } from '../prisma/prisma.service';

const baseTest = {
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

const mockPrisma = {
  strategyTest: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

describe('AbTestingService', () => {
  let service: AbTestingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AbTestingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<AbTestingService>(AbTestingService);
  });

  describe('createTest', () => {
    it('should create test with active status', async () => {
      const dto = { name: 'My Test', strategyA: { x: 1 }, strategyB: { x: 2 } };
      mockPrisma.strategyTest.create.mockResolvedValue({ ...baseTest, ...dto });
      const result = await service.createTest('user-1', dto);
      expect(mockPrisma.strategyTest.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          name: 'My Test',
          description: undefined,
          strategyA: { x: 1 },
          strategyB: { x: 2 },
          status: 'active',
        },
      });
      expect(result.status).toBe('active');
    });
  });

  describe('recordRun', () => {
    it('should return null if test not found', async () => {
      mockPrisma.strategyTest.findUnique.mockResolvedValue(null);
      const result = await service.recordRun('bad-id', { variant: 'A', success: true, durationMs: 100 });
      expect(result).toBeNull();
    });

    it('should return null if test is not active', async () => {
      mockPrisma.strategyTest.findUnique.mockResolvedValue({ ...baseTest, status: 'completed' });
      const result = await service.recordRun('test-1', { variant: 'A', success: true, durationMs: 100 });
      expect(result).toBeNull();
    });

    it('should increment runs for variant A', async () => {
      mockPrisma.strategyTest.findUnique.mockResolvedValue({ ...baseTest });
      mockPrisma.strategyTest.update.mockResolvedValue({ ...baseTest, totalRunsA: 1 });
      await service.recordRun('test-1', { variant: 'A', success: true, durationMs: 200 });
      expect(mockPrisma.strategyTest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalRunsA: { increment: 1 } }),
        }),
      );
    });

    it('should increment runs for variant B', async () => {
      mockPrisma.strategyTest.findUnique.mockResolvedValue({ ...baseTest });
      mockPrisma.strategyTest.update.mockResolvedValue({ ...baseTest, totalRunsB: 1 });
      await service.recordRun('test-1', { variant: 'B', success: false, durationMs: 150 });
      expect(mockPrisma.strategyTest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalRunsB: { increment: 1 } }),
        }),
      );
    });

    it('should increment success count on successful run', async () => {
      mockPrisma.strategyTest.findUnique.mockResolvedValue({ ...baseTest });
      mockPrisma.strategyTest.update.mockResolvedValue({ ...baseTest, successA: 1 });
      await service.recordRun('test-1', { variant: 'A', success: true, durationMs: 100 });
      expect(mockPrisma.strategyTest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ successA: { increment: 1 } }),
        }),
      );
    });

    it('should not increment success when run failed', async () => {
      mockPrisma.strategyTest.findUnique.mockResolvedValue({ ...baseTest });
      mockPrisma.strategyTest.update.mockResolvedValue({ ...baseTest, successA: 0 });
      await service.recordRun('test-1', { variant: 'A', success: false, durationMs: 100 });
      const updateCall = mockPrisma.strategyTest.update.mock.calls[0][0];
      expect(updateCall.data.successA).toBeUndefined();
    });

    it('should update average duration', async () => {
      mockPrisma.strategyTest.findUnique.mockResolvedValue({ ...baseTest, avgDurationA: 100, totalRunsA: 2 });
      mockPrisma.strategyTest.update.mockResolvedValue({ ...baseTest, avgDurationA: 125 });
      await service.recordRun('test-1', { variant: 'A', success: true, durationMs: 200 });
      expect(mockPrisma.strategyTest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ avgDurationA: expect.any(Number) }),
        }),
      );
    });
  });

  describe('getResults', () => {
    it('should return null for non-existent test', async () => {
      mockPrisma.strategyTest.findUnique.mockResolvedValue(null);
      const result = await service.getResults('bad-id');
      expect(result).toBeNull();
    });

    it('should calculate success rates', async () => {
      mockPrisma.strategyTest.findUnique.mockResolvedValue({
        ...baseTest, totalRunsA: 10, successA: 8, totalRunsB: 10, successB: 5,
      });
      const result = await service.getResults('test-1');
      expect(result!.variantA.successRate).toBe(80);
      expect(result!.variantB.successRate).toBe(50);
    });

    it('should return 0 rates when no runs', async () => {
      mockPrisma.strategyTest.findUnique.mockResolvedValue({ ...baseTest });
      const result = await service.getResults('test-1');
      expect(result!.variantA.successRate).toBe(0);
      expect(result!.variantB.successRate).toBe(0);
    });
  });

  describe('listActive', () => {
    it('should return active tests for user', async () => {
      mockPrisma.strategyTest.findMany.mockResolvedValue([baseTest]);
      const result = await service.listActive('user-1');
      expect(mockPrisma.strategyTest.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: 'active' },
        orderBy: { startedAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('checkWinner', () => {
    it('should not declare winner before 10 runs per variant', async () => {
      mockPrisma.strategyTest.update.mockResolvedValue({});
      const test = { ...baseTest, totalRunsA: 5, totalRunsB: 5 };
      await (service as any).checkWinner('test-1', test);
      expect(mockPrisma.strategyTest.update).not.toHaveBeenCalled();
    });

    it('should declare A winner when rateA > rateB by >15%', async () => {
      mockPrisma.strategyTest.update.mockResolvedValue({});
      const test = { ...baseTest, name: 'Win Test', totalRunsA: 20, successA: 18, totalRunsB: 20, successB: 10 };
      await (service as any).checkWinner('test-1', test);
      expect(mockPrisma.strategyTest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ winner: 'A', status: 'completed' }),
        }),
      );
    });

    it('should not declare winner when diff ≤15%', async () => {
      mockPrisma.strategyTest.update.mockResolvedValue({});
      const test = { ...baseTest, totalRunsA: 20, successA: 12, totalRunsB: 20, successB: 11 };
      await (service as any).checkWinner('test-1', test);
      expect(mockPrisma.strategyTest.update).not.toHaveBeenCalled();
    });
  });

  describe('calculateSignificance', () => {
    it('should return 0 when sample size < 5', () => {
      const result = (service as any).calculateSignificance(3, 80, 4, 60);
      expect(result).toBe(0);
    });

    it('should return a value between 0 and 1', () => {
      const result = (service as any).calculateSignificance(50, 85, 50, 60);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should return 0 when se is 0', () => {
      const result = (service as any).calculateSignificance(10, 100, 10, 100);
      expect(result).toBe(0);
    });
  });
});
