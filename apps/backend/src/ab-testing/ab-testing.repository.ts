// apps/backend/src/ab-testing/ab-testing.repository.ts
//
// Data-access layer for ab-testing. Wraps every prisma.strategyTest call that
// used to live inline in ab-testing.service.ts (create / findUnique / findMany
// / update x2), so the service holds pure business logic and can be unit-tested
// against a mocked repository instead of a mocked PrismaClient. This is the ONLY
// file in the module that touches Prisma.

import { injectable, inject } from 'inversify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { TYPES } from '../core/container';
import type { CreateTestInput, StrategyTestRecord } from './ab-testing.model';

@injectable()
export class AbTestingRepository {
  constructor(@inject(TYPES.PrismaClient) private readonly prisma: PrismaClient) {}

  async createTest(userId: string, dto: CreateTestInput): Promise<StrategyTestRecord> {
    const created = await this.prisma.strategyTest.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        strategyA: dto.strategyA as Prisma.InputJsonValue,
        strategyB: dto.strategyB as Prisma.InputJsonValue,
        status: 'active',
      },
    });
    return created as unknown as StrategyTestRecord;
  }

  async findTest(id: string): Promise<StrategyTestRecord | null> {
    const test = await this.prisma.strategyTest.findUnique({ where: { id } });
    return test as unknown as StrategyTestRecord | null;
  }

  async listActiveByUser(userId: string): Promise<StrategyTestRecord[]> {
    const tests = await this.prisma.strategyTest.findMany({
      where: { userId, status: 'active' },
      orderBy: { startedAt: 'desc' },
    });
    return tests as unknown as StrategyTestRecord[];
  }

  async applyRun(
    id: string,
    args: {
      runField: 'totalRunsA' | 'totalRunsB';
      successField: 'successA' | 'successB';
      durationField: 'avgDurationA' | 'avgDurationB';
      newAvgDuration: number;
      incrementSuccess: boolean;
    },
  ): Promise<StrategyTestRecord> {
    const updated = await this.prisma.strategyTest.update({
      where: { id },
      data: {
        [args.runField]: { increment: 1 },
        [args.successField]: args.incrementSuccess ? { increment: 1 } : undefined,
        [args.durationField]: args.newAvgDuration,
      },
    });
    return updated as unknown as StrategyTestRecord;
  }

  async declareWinner(id: string, winner: 'A' | 'B'): Promise<StrategyTestRecord> {
    const updated = await this.prisma.strategyTest.update({
      where: { id },
      data: { winner, status: 'completed', completedAt: new Date() },
    });
    return updated as unknown as StrategyTestRecord;
  }
}
