import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryStoreService } from '../agent/memory-store.service';

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

export interface PerformanceTrendPoint {
  date: string;
  successRate: number;
  avgConfidence: number;
  totalRuns: number;
}

export interface DomainMasteryScore {
  domain: string;
  successRate: number;
  totalRuns: number;
  improvementRate: number;
  masteryLevel: 'novice' | 'learning' | 'competent' | 'expert';
}

export interface StrategyEffectiveness {
  strategy: string;
  successRate: number;
  avgConfidence: number;
  totalRuns: number;
  avgDurationMs: number;
}

export interface ImplicitFeedbackScore {
  overall: number;
  trend: 'improving' | 'stable' | 'declining';
  factors: {
    successRate: number;
    recoveryRate: number;
    avgConfidence: number;
    consistency: number;
  };
}

const MASTERY_THRESHOLDS = {
  novice: 0.4,
  learning: 0.6,
  competent: 0.8,
  expert: 1.0,
};

@Injectable()
export class LearningEngineService {
  private readonly logger = new Logger(LearningEngineService.name);

  constructor(
    private prisma: PrismaService,
    private memoryStore: MemoryStoreService,
  ) {}

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

    await this.memoryStore.upsert(
      id,
      userId,
      'SEMANTIC',
      `learning:${domain}:${site}`,
      JSON.stringify(stats),
      0.7,
    );

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

  async recordExecutionOutcome(
    userId: string,
    domain: string,
    success: boolean,
    durationMs: number,
    confidence?: number,
  ): Promise<void> {
    const key = `implicit:${domain}:overall`;
    const id = `implicit_${userId}_${domain}`;

    const existing = await this.prisma.agentMemory.findUnique({ where: { id } });
    let stats: SitePerformanceStats;
    if (existing) {
      try { stats = JSON.parse(existing.content); } catch { stats = this.defaultStats(domain, key); }
    } else {
      stats = this.defaultStats(domain, key);
    }

    const n = stats.totalRuns + 1;
    stats.successRate = ((stats.successRate * stats.totalRuns) + (success ? 1 : 0)) / n;
    stats.totalRuns = n;
    stats.avgDurationMs = Math.round((stats.avgDurationMs * (n - 1) + durationMs) / n);
    if (confidence !== undefined) {
      stats.avgConfidence = ((stats.avgConfidence * (n - 1)) + confidence) / n;
    }
    stats.lastUpdated = Date.now();

    await this.memoryStore.upsert(
      id,
      userId,
      'SEMANTIC',
      key,
      JSON.stringify(stats),
      0.8,
    );
  }

  async getPerformanceTrend(
    userId: string,
    domain?: string,
    days = 30,
  ): Promise<PerformanceTrendPoint[]> {
    const where: any = {
      userId,
      type: 'EPISODIC',
      createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    };
    if (domain) where.metadata = { path: ['domain'], equals: domain };

    const episodes = await this.prisma.memory.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, metadata: true },
    });

    const dayBuckets = new Map<string, { successes: number; total: number; confidences: number[] }>();
    for (const ep of episodes) {
      const day = ep.createdAt.toISOString().split('T')[0];
      if (!dayBuckets.has(day)) dayBuckets.set(day, { successes: 0, total: 0, confidences: [] });
      const bucket = dayBuckets.get(day)!;
      bucket.total++;
      if ((ep.metadata as any)?.outcome === 'success') bucket.successes++;
      const q = (ep.metadata as any)?.outcomeQuality;
      if (typeof q === 'number') bucket.confidences.push(q);
    }

    return Array.from(dayBuckets.entries())
      .map(([date, b]) => ({
        date,
        successRate: b.total > 0 ? b.successes / b.total : 0,
        avgConfidence: b.confidences.length > 0
          ? b.confidences.reduce((a, c) => a + c, 0) / b.confidences.length
          : 0,
        totalRuns: b.total,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getDomainMastery(userId: string): Promise<DomainMasteryScore[]> {
    const memories = await this.prisma.agentMemory.findMany({
      where: { userId, key: { endsWith: ':overall' } },
    });

    const scores: DomainMasteryScore[] = [];

    for (const mem of memories) {
      try {
        const stats = JSON.parse(mem.content) as SitePerformanceStats;
        const trend = await this.getPerformanceTrend(userId, stats.domain, 14);
        const improvementRate = trend.length >= 2
          ? trend[trend.length - 1].successRate - trend[0].successRate
          : 0;

        scores.push({
          domain: stats.domain,
          successRate: stats.successRate,
          totalRuns: stats.totalRuns,
          improvementRate,
          masteryLevel: this.classifyMastery(stats.successRate),
        });
      } catch { /* skip */ }
    }

    return scores.sort((a, b) => b.successRate - a.successRate);
  }

  async getStrategyEffectiveness(userId: string): Promise<StrategyEffectiveness[]> {
    const memories = await this.prisma.agentMemory.findMany({
      where: {
        userId,
        key: { startsWith: 'learning:' },
        NOT: { key: { endsWith: ':overall' } },
      },
    });

    return memories
      .map((m) => {
        try {
          const s = JSON.parse(m.content) as SitePerformanceStats;
          return {
            strategy: `${s.domain}:${s.site}`,
            successRate: s.successRate,
            avgConfidence: s.avgConfidence,
            totalRuns: s.totalRuns,
            avgDurationMs: s.avgDurationMs,
          } satisfies StrategyEffectiveness;
        } catch { return null; }
      })
      .filter((s): s is StrategyEffectiveness => s !== null)
      .sort((a, b) => b.successRate - a.successRate || b.totalRuns - a.totalRuns);
  }

  async getImplicitFeedbackScore(userId: string): Promise<ImplicitFeedbackScore> {
    const memories = await this.prisma.agentMemory.findMany({
      where: { userId, key: { endsWith: ':overall' } },
    });

    let totalSuccess = 0;
    let totalRuns = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;
    let totalRecovery = 0;
    let recoveryCount = 0;

    for (const m of memories) {
      try {
        const s = JSON.parse(m.content) as SitePerformanceStats;
        totalSuccess += s.successRate * s.totalRuns;
        totalRuns += s.totalRuns;
        if (s.avgConfidence > 0) { totalConfidence += s.avgConfidence; confidenceCount++; }
        if (s.recoveryRate > 0) { totalRecovery += s.recoveryRate; recoveryCount++; }
      } catch { /* skip */ }
    }

    const overallSuccessRate = totalRuns > 0 ? totalSuccess / totalRuns : 0;
    const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
    const avgRecovery = recoveryCount > 0 ? totalRecovery / recoveryCount : 0;

    const variance = this.computeConsistency(memories);
    const trend = this.computeTrend(overallSuccessRate, avgConfidence, avgRecovery, variance);

    return {
      overall: Math.round((overallSuccessRate * 0.4 + avgConfidence * 0.3 + avgRecovery * 0.2 + (1 - variance) * 0.1) * 100) / 100,
      trend,
      factors: {
        successRate: overallSuccessRate,
        recoveryRate: avgRecovery,
        avgConfidence,
        consistency: 1 - variance,
      },
    };
  }

  private classifyMastery(successRate: number): DomainMasteryScore['masteryLevel'] {
    if (successRate >= MASTERY_THRESHOLDS.expert) return 'expert';
    if (successRate >= MASTERY_THRESHOLDS.competent) return 'competent';
    if (successRate >= MASTERY_THRESHOLDS.learning) return 'learning';
    return 'novice';
  }

  private computeConsistency(memories: any[]): number {
    const rates = memories
      .map((m) => {
        try { return (JSON.parse(m.content) as SitePerformanceStats).successRate; } catch { return null; }
      })
      .filter((r): r is number => r !== null);
    if (rates.length < 2) return 0;
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((sum, r) => sum + (r - mean) ** 2, 0) / rates.length;
    return Math.min(variance, 1);
  }

  private computeTrend(
    successRate: number,
    _avgConfidence: number,
    _avgRecovery: number,
    _variance: number,
  ): ImplicitFeedbackScore['trend'] {
    if (successRate >= 0.75) return 'improving';
    if (successRate >= 0.4) return 'stable';
    return 'declining';
  }

  private defaultStats(domain: string, key: string): SitePerformanceStats {
    return { domain, site: key, successRate: 0, avgDurationMs: 0, recoveryRate: 0, avgConfidence: 0, totalRuns: 0, lastUpdated: Date.now() };
  }
}
