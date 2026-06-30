import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from './memory.service';
import { MemoryType } from '@prisma/client';
import { SemanticMemoryService } from './semantic-memory.service';

export interface ConsolidationReport {
  userId: string;
  promoted: number;
  prunedExpired: number;
  prunedLowImportance: number;
  boostedByAccess: number;
  conflictsResolved: number;
  duplicatesRemoved: number;
  totalProcessed: number;
}

@Injectable()
export class MemoryConsolidationService {
  private readonly logger = new Logger(MemoryConsolidationService.name);

  constructor(
    private prisma: PrismaService,
    private memoryService: MemoryService,
    private semanticMemoryService: SemanticMemoryService,
  ) {}

  async consolidateUser(userId: string): Promise<ConsolidationReport> {
    const report: ConsolidationReport = {
      userId,
      promoted: 0,
      prunedExpired: 0,
      prunedLowImportance: 0,
      boostedByAccess: 0,
      conflictsResolved: 0,
      duplicatesRemoved: 0,
      totalProcessed: 0,
    };

    const promoted = await this.promoteWorkingMemories(userId);
    report.promoted = promoted;

    const prunedExpired = await this.pruneExpiredMemories(userId);
    report.prunedExpired = prunedExpired;

    const prunedLow = await this.pruneLowImportance(userId, 0.15);
    report.prunedLowImportance = prunedLow;

    const boosted = await this.boostByAccess(userId);
    report.boostedByAccess = boosted;

    const duplicates = await this.semanticMemoryService.deduplicateFacts(userId);
    report.duplicatesRemoved = duplicates;

    report.totalProcessed = promoted + prunedExpired + prunedLow + boosted + duplicates;

    this.logger.log(`Consolidation for ${userId}: ${report.totalProcessed} operations`);
    return report;
  }

  async promoteWorkingMemories(userId: string): Promise<number> {
    const workingMemories = await this.prisma.memory.findMany({
      where: {
        userId,
        type: 'WORKING' as MemoryType,
        deletedAt: null,
        importance: { gte: 0.7 },
      },
    });

    let promoted = 0;
    for (const mem of workingMemories) {
      try {
        const content = JSON.parse(mem.content);
        if (content.status === 'completed') {
          await this.prisma.memory.update({
            where: { id: mem.id },
            data: {
              type: 'EPISODIC' as MemoryType,
              importance: Math.min(0.95, mem.importance + 0.1),
              summary: mem.summary ? `[Promoted] ${mem.summary}` : undefined,
              metadata: {
                ...((mem.metadata as any) || {}),
                promotedFrom: 'working',
                consolidatedAt: new Date().toISOString(),
              },
            },
          });
          promoted++;
        }
      } catch { /* skip unparseable */ }
    }

    if (promoted > 0) {
      this.logger.debug(`Promoted ${promoted} working memories for user ${userId}`);
    }
    return promoted;
  }

  async pruneExpiredMemories(userId: string): Promise<number> {
    const result = await this.prisma.memory.updateMany({
      where: {
        userId,
        expiresAt: { lte: new Date() },
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });

    if (result.count > 0) {
      this.logger.debug(`Pruned ${result.count} expired memories for user ${userId}`);
    }
    return result.count;
  }

  async pruneLowImportance(userId: string, threshold = 0.15): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.memory.updateMany({
      where: {
        userId,
        importance: { lte: threshold },
        createdAt: { lte: thirtyDaysAgo },
        deletedAt: null,
        type: { notIn: ['WORKING' as MemoryType] },
      },
      data: { deletedAt: new Date() },
    });

    if (result.count > 0) {
      this.logger.debug(`Pruned ${result.count} low-importance memories for user ${userId}`);
    }
    return result.count;
  }

  async boostByAccess(userId: string): Promise<number> {
    const now = new Date();
    const recentThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const memories = await this.prisma.memory.findMany({
      where: {
        userId,
        deletedAt: null,
        lastUsedAt: { gte: recentThreshold },
        importance: { lt: 0.95 },
      },
    });

    let boosted = 0;
    for (const mem of memories) {
      const boost = Math.min(0.05 * (mem.accessCount || 1), 0.2);
      await this.prisma.memory.update({
        where: { id: mem.id },
        data: { importance: Math.min(0.95, mem.importance + boost) },
      });
      boosted++;
    }

    if (boosted > 0) {
      this.logger.debug(`Boosted importance for ${boosted} frequently-accessed memories for user ${userId}`);
    }
    return boosted;
  }

  async runFullConsolidation(userIds?: string[]): Promise<ConsolidationReport[]> {
    const users = userIds ?? await this.getAllUserIds();
    const reports: ConsolidationReport[] = [];

    for (const userId of users) {
      try {
        const report = await this.consolidateUser(userId);
        reports.push(report);
      } catch (error: any) {
        this.logger.error(`Consolidation failed for ${userId}: ${error.message}`);
      }
    }

    this.logger.log(`Full consolidation completed for ${reports.length} users`);
    return reports;
  }

  private async getAllUserIds(): Promise<string[]> {
    const results = await this.prisma.memory.findMany({
      select: { userId: true },
      distinct: ['userId'],
    });
    return results.map((r) => r.userId);
  }
}
