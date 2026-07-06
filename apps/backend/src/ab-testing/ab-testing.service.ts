import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateTestDto {
  name: string;
  description?: string;
  strategyA: Record<string, unknown>;
  strategyB: Record<string, unknown>;
}

export interface RecordRunDto {
  variant: 'A' | 'B';
  success: boolean;
  durationMs: number;
}

@Injectable()
export class AbTestingService {
  private readonly logger = new Logger(AbTestingService.name);

  constructor(private prisma: PrismaService) {}

  async createTest(userId: string, dto: CreateTestDto) {
    return this.prisma.strategyTest.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        strategyA: dto.strategyA as Prisma.InputJsonValue,
        strategyB: dto.strategyB as Prisma.InputJsonValue,
        status: 'active',
      },
    });
  }

  async recordRun(testId: string, dto: RecordRunDto) {
    const test = await this.prisma.strategyTest.findUnique({ where: { id: testId } });
    if (!test || test.status !== 'active') return null;

    const field = dto.variant === 'A' ? 'totalRunsA' : 'totalRunsB';
    const successField = dto.variant === 'A' ? 'successA' : 'successB';
    const durationField = dto.variant === 'A' ? 'avgDurationA' : 'avgDurationB';

    const currentRuns = test[field];
    const currentAvgDuration = test[durationField];
    const newAvg = currentRuns > 0
      ? (currentAvgDuration * currentRuns + dto.durationMs) / (currentRuns + 1)
      : dto.durationMs;

    const updated = await this.prisma.strategyTest.update({
      where: { id: testId },
      data: {
        [field]: { increment: 1 },
        [successField]: dto.success ? { increment: 1 } : undefined,
        [durationField]: newAvg,
      },
    });

    await this.checkWinner(testId, updated);
    return updated;
  }

  async getResults(testId: string) {
    const test = await this.prisma.strategyTest.findUnique({ where: { id: testId } });
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
    return this.prisma.strategyTest.findMany({
      where: { userId, status: 'active' },
      orderBy: { startedAt: 'desc' },
    });
  }

  private async checkWinner(testId: string, test: any) {
    if (test.totalRunsA < 10 || test.totalRunsB < 10) return;

    const rateA = test.successA / test.totalRunsA;
    const rateB = test.successB / test.totalRunsB;
    const diff = Math.abs(rateA - rateB);

    if (diff > 0.15 && (rateA > rateB || rateB > rateA)) {
      const winner = rateA > rateB ? 'A' : 'B';
      await this.prisma.strategyTest.update({
        where: { id: testId },
        data: { winner, status: 'completed', completedAt: new Date() },
      });
      this.logger.log(`Test "${test.name}" completed: Winner = Variant ${winner}`);
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
