import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SitePerformanceStats {
  domain: string;
  site: string;
  successRate: number;
  avgDurationMs: number;
  recoveryRate: number;
  avgConfidence: number;
  totalRuns: number;
  lastUpdated: number;
}

@Injectable()
export class LearningEngineService {
  private readonly logger = new Logger(LearningEngineService.name);

  constructor(private prisma: PrismaService) {}

  private statsId(userId: string, domain: string, site: string): string {
    return `learning_${userId}_${domain}_${site}`;
  }

  async recordRun(
    userId: string,
    domain: string,
    site: string,
    success: boolean,
    durationMs: number,
    recovered: boolean,
    confidence?: number,
  ): Promise<void> {
    const id = this.statsId(userId, domain, site);
    const existing = await this.prisma.agentMemory.findUnique({ where: { id } });

    let stats: SitePerformanceStats = {
      domain,
      site,
      successRate: 0,
      avgDurationMs: 0,
      recoveryRate: 0,
      avgConfidence: 0,
      totalRuns: 0,
      lastUpdated: Date.now(),
    };

    if (existing) {
      try {
        stats = { avgConfidence: 0, ...JSON.parse(existing.content) };
      } catch {
        /* use defaults */
      }
    }

    const n = stats.totalRuns + 1;
    const prevSuccesses = stats.successRate * stats.totalRuns;
    const prevRecoveries = stats.recoveryRate * stats.totalRuns;
    const prevConfidence = (stats.avgConfidence ?? 0) * stats.totalRuns;
    // Runs that report no confidence contribute the existing average, so the
    // running mean stays stable rather than collapsing toward zero.
    const confidenceContribution = confidence ?? stats.avgConfidence ?? 0;

    stats.totalRuns = n;
    stats.successRate = (prevSuccesses + (success ? 1 : 0)) / n;
    stats.recoveryRate = (prevRecoveries + (recovered ? 1 : 0)) / n;
    stats.avgConfidence = (prevConfidence + confidenceContribution) / n;
    stats.avgDurationMs = Math.round(
      (stats.avgDurationMs * (n - 1) + durationMs) / n,
    );
    stats.lastUpdated = Date.now();

    await this.prisma.agentMemory.upsert({
      where: { id },
      update: { content: JSON.stringify(stats), lastAccessedAt: new Date() },
      create: {
        id,
        userId,
        type: 'SEMANTIC',
        key: `learning:${domain}:${site}`,
        content: JSON.stringify(stats),
        embedding: [],
        importance: 0.7,
      },
    });

    this.logger.debug(
      `[Learning] ${site}/${domain} success=${(stats.successRate * 100).toFixed(0)}% recovery=${(stats.recoveryRate * 100).toFixed(0)}% confidence=${(stats.avgConfidence * 100).toFixed(0)}%`,
    );
  }

  async getRankedSites(
    userId: string,
    domain: string,
  ): Promise<SitePerformanceStats[]> {
    const memories = await this.prisma.agentMemory.findMany({
      where: {
        userId,
        key: { startsWith: `learning:${domain}:` },
      },
    });

    return memories
      .map((m) => {
        try {
          return JSON.parse(m.content) as SitePerformanceStats;
        } catch {
          return null;
        }
      })
      .filter((s): s is SitePerformanceStats => s !== null)
      .sort((a, b) => b.successRate - a.successRate || b.recoveryRate - a.recoveryRate);
  }
}
