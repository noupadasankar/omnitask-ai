import { Injectable, Logger } from '@nestjs/common';
import { JobApplicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JobMatchResult } from './job-match-scorer.service';

export interface TrackedJobInput {
  portal: string;
  externalJobId: string;
  title: string;
  company?: string;
  location?: string;
  url?: string;
}

/**
 * Application tracking + duplicate prevention (ported from the spec's SQLite
 * tracker, backed by Prisma/Postgres). The (userId, portal, externalJobId)
 * unique constraint guarantees a job is never processed or applied to twice.
 */
@Injectable()
export class JobTrackerService {
  private readonly logger = new Logger(JobTrackerService.name);

  constructor(private prisma: PrismaService) {}

  /** True if this user already has any record for the job (any status). */
  async alreadySeen(userId: string, portal: string, externalJobId: string): Promise<boolean> {
    const existing = await this.prisma.jobApplication.findUnique({
      where: { userId_portal_externalJobId: { userId, portal, externalJobId } },
      select: { id: true },
    });
    return existing !== null;
  }

  /** Records a scored match. Idempotent on (userId, portal, externalJobId). */
  async recordMatch(
    userId: string,
    job: TrackedJobInput,
    match: JobMatchResult,
    status: JobApplicationStatus,
  ) {
    return this.prisma.jobApplication.upsert({
      where: {
        userId_portal_externalJobId: {
          userId,
          portal: job.portal,
          externalJobId: job.externalJobId,
        },
      },
      update: {
        score: match.score,
        matchReasons: match.reasons as unknown as Prisma.InputJsonValue,
        status,
        title: job.title,
        company: job.company ?? null,
        location: job.location ?? null,
        url: job.url ?? null,
      },
      create: {
        userId,
        portal: job.portal,
        externalJobId: job.externalJobId,
        title: job.title,
        company: job.company ?? null,
        location: job.location ?? null,
        url: job.url ?? null,
        score: match.score,
        matchReasons: match.reasons as unknown as Prisma.InputJsonValue,
        status,
      },
    });
  }

  async markApplied(id: string, sessionId?: string) {
    return this.prisma.jobApplication.update({
      where: { id },
      data: { status: 'APPLIED', appliedAt: new Date(), sessionId: sessionId ?? undefined },
    });
  }

  async markFailed(id: string, errorMessage: string) {
    return this.prisma.jobApplication.update({
      where: { id },
      data: { status: 'FAILED', errorMessage },
    });
  }

  async setStatus(id: string, status: JobApplicationStatus) {
    return this.prisma.jobApplication.update({ where: { id }, data: { status } });
  }

  /** Count applications submitted today — enforces the daily limit. */
  async appliedToday(userId: string): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.prisma.jobApplication.count({
      where: { userId, status: 'APPLIED', appliedAt: { gte: start } },
    });
  }

  async list(userId: string, status?: JobApplicationStatus, take = 100) {
    return this.prisma.jobApplication.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async stats(userId: string) {
    const rows = await this.prisma.jobApplication.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = r._count._all;
    return {
      matched: counts['MATCHED'] || 0,
      skipped: counts['SKIPPED'] || 0,
      pendingApproval: counts['PENDING_APPROVAL'] || 0,
      applied: counts['APPLIED'] || 0,
      failed: counts['FAILED'] || 0,
      appliedToday: await this.appliedToday(userId),
    };
  }
}
