// apps/backend/src/feedback/feedback.repository.ts
//
// Data-access layer for feedback. Wraps the 3 Prisma calls that used to live
// inline in feedback.service.ts (create, findMany x2), so the service can be
// tested against a mocked repository instead of a mocked PrismaClient.

import { injectable, inject } from 'inversify';
import type { PrismaClient } from '@prisma/client';
import { TYPES } from '../core/container';
import type { FeedbackRow } from './feedback.model';

@injectable()
export class FeedbackRepository {
  constructor(@inject(TYPES.PrismaClient) private readonly prisma: PrismaClient) {}

  create(data: {
    userId: string;
    taskId?: string;
    sessionId?: string;
    rating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';
    comment?: string;
    category: string;
  }) {
    return this.prisma.taskFeedback.create({ data });
  }

  findByUser(userId: string, limit: number) {
    return this.prisma.taskFeedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findAllForStats(userId: string): Promise<FeedbackRow[]> {
    return this.prisma.taskFeedback.findMany({
      where: { userId },
      select: { rating: true, category: true },
    }) as unknown as FeedbackRow[];
  }
}
