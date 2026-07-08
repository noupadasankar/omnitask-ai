// apps/backend/src/ab-testing/ab-testing.service.ts
//
// Business logic for ab-testing — identical behavior to the old NestJS
// AbTestingService (running average-duration math, checkWinner threshold logic,
// getResults rate/significance formatting, z-score significance), now injectable
// via Inversify and delegating all persistence to AbTestingRepository. Holds no
// '@prisma/client' access.

import { injectable, inject } from 'inversify';
import { TYPES } from '../core/container';
import { AbTestingRepository } from './ab-testing.repository';
import type {
  AbTestResults,
  CreateTestInput,
  RecordRunInput,
  StrategyTestRecord,
} from './ab-testing.model';

@injectable()
export class AbTestingService {
  constructor(
    @inject(TYPES.AbTestingRepository) private readonly repo: AbTestingRepository,
  ) {}

  async createTest(userId: string, dto: CreateTestInput) {
    return this.repo.createTest(userId, dto);
  }

  async recordRun(testId: string, dto: RecordRunInput) {
    const test = await this.repo.findTest(testId);
    if (!test || test.status !== 'active') return null;

    const runField = dto.variant === 'A' ? 'totalRunsA' : 'totalRunsB';
    const successField = dto.variant === 'A' ? 'successA' : 'successB';
    const durationField = dto.variant === 'A' ? 'avgDurationA' : 'avgDurationB';

    const currentRuns = test[runField];
    const currentAvgDuration = test[durationField];
    const newAvgDuration =
      currentRuns > 0
        ? (currentAvgDuration * currentRuns + dto.durationMs) / (currentRuns + 1)
        : dto.durationMs;

    const updated = await this.repo.applyRun(testId, {
      runField,
      successField,
      durationField,
      newAvgDuration,
      incrementSuccess: dto.success,
    });

    await this.checkWinner(testId, updated);
    return updated;
  }

  async getResults(testId: string): Promise<AbTestResults | null> {
    const test = await this.repo.findTest(testId);
    if (!test) return null;

    const rateA = test.totalRunsA > 0 ? (test.successA / test.totalRunsA) * 100 : 0;
    const rateB = test.totalRunsB > 0 ? (test.successB / test.totalRunsB) * 100 : 0;

    return {
      id: test.id,
      name: test.name,
      status: test.status,
      winner: test.winner,
      variantA: {
        totalRuns: test.totalRunsA,
        successes: test.successA,
        successRate: +rateA.toFixed(1),
        avgDurationMs: Math.round(test.avgDurationA),
      },
      variantB: {
        totalRuns: test.totalRunsB,
        successes: test.successB,
        successRate: +rateB.toFixed(1),
        avgDurationMs: Math.round(test.avgDurationB),
      },
      significance: this.calculateSignificance(test.totalRunsA, rateA, test.totalRunsB, rateB),
    };
  }

  async listActive(userId: string) {
    return this.repo.listActiveByUser(userId);
  }

  private async checkWinner(testId: string, test: StrategyTestRecord) {
    if (test.totalRunsA < 10 || test.totalRunsB < 10) return;

    const rateA = test.successA / test.totalRunsA;
    const rateB = test.successB / test.totalRunsB;
    const diff = Math.abs(rateA - rateB);

    if (diff > 0.15 && (rateA > rateB || rateB > rateA)) {
      const winner = rateA > rateB ? 'A' : 'B';
      await this.repo.declareWinner(testId, winner);
      console.log(`Test "${test.name}" completed: Winner = Variant ${winner}`);
    }
  }

  private calculateSignificance(nA: number, rateA: number, nB: number, rateB: number): number {
    if (nA < 5 || nB < 5) return 0;
    const pA = rateA / 100;
    const pB = rateB / 100;
    const se = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
    if (se === 0) return 0;
    const z = Math.abs(pA - pB) / se;
    return +Math.min(1, z / 3).toFixed(2);
  }
}
