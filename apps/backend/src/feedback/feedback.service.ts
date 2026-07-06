import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateFeedbackDto {
  taskId?: string;
  sessionId?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  category?: string;
}

interface FeedbackRow {
  rating: string;
  category: string | null;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private prisma: PrismaService) {}

  async submit(userId: string, dto: CreateFeedbackDto) {
    const ratingMap = { 1: 'ONE', 2: 'TWO', 3: 'THREE', 4: 'FOUR', 5: 'FIVE' } as const;
    const feedback = await this.prisma.taskFeedback.create({
      data: {
        userId,
        taskId: dto.taskId,
        sessionId: dto.sessionId,
        rating: ratingMap[dto.rating],
        comment: dto.comment,
        category: dto.category || 'general',
      },
    });
    this.logger.log(`Feedback submitted: user=${userId} rating=${dto.rating}`);
    return feedback;
  }

  async list(userId: string, limit = 20) {
    return this.prisma.taskFeedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getStats(userId: string) {
    const feedbacks = await this.prisma.taskFeedback.findMany({
      where: { userId },
      select: { rating: true, category: true },
    }) as unknown as FeedbackRow[];
    const total = feedbacks.length;
    if (total === 0) return { total: 0, averageRating: 0, distribution: {}, categoryBreakdown: {} };

    const ratingValues: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
    let sum = 0;
    for (const f of feedbacks) {
      sum += ratingValues[f.rating] || 0;
    }
    const distribution: Record<string, number> = {};
    const categoryBreakdown: Record<string, number> = {};
    for (const f of feedbacks) {
      distribution[f.rating] = (distribution[f.rating] || 0) + 1;
      if (f.category) categoryBreakdown[f.category] = (categoryBreakdown[f.category] || 0) + 1;
    }
    return { total, averageRating: +(sum / total).toFixed(2), distribution, categoryBreakdown };
  }
}
