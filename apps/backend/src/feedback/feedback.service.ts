// apps/backend/src/feedback/feedback.service.ts
//
// Business logic for feedback — same behavior as the old NestJS
// FeedbackService, now injectable via Inversify and delegating persistence
// to FeedbackRepository instead of talking to PrismaService directly.

import { injectable, inject } from 'inversify';
import { TYPES } from '../core/container';
import { FeedbackRepository } from './feedback.repository';
import {
  RATING_MAP,
  RATING_VALUES,
  type CreateFeedbackInput,
  type FeedbackStats,
} from './feedback.model';

@injectable()
export class FeedbackService {
  constructor(
    @inject(TYPES.FeedbackRepository) private readonly repo: FeedbackRepository,
  ) {}

  async submit(userId: string, dto: CreateFeedbackInput) {
    const feedback = await this.repo.create({
      userId,
      taskId: dto.taskId,
      sessionId: dto.sessionId,
      rating: RATING_MAP[dto.rating],
      comment: dto.comment,
      category: dto.category || 'general',
    });
    console.log(`Feedback submitted: user=${userId} rating=${dto.rating}`);
    return feedback;
  }

  list(userId: string, limit = 20) {
    return this.repo.findByUser(userId, limit);
  }

  async getStats(userId: string): Promise<FeedbackStats> {
    const feedbacks = await this.repo.findAllForStats(userId);
    const total = feedbacks.length;
    if (total === 0) {
      return { total: 0, averageRating: 0, distribution: {}, categoryBreakdown: {} };
    }

    let sum = 0;
    const distribution: Record<string, number> = {};
    const categoryBreakdown: Record<string, number> = {};
    for (const f of feedbacks) {
      sum += RATING_VALUES[f.rating] || 0;
      distribution[f.rating] = (distribution[f.rating] || 0) + 1;
      if (f.category) categoryBreakdown[f.category] = (categoryBreakdown[f.category] || 0) + 1;
    }

    return { total, averageRating: +(sum / total).toFixed(2), distribution, categoryBreakdown };
  }
}
