import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from './memory.service';
import { MemoryType } from '@prisma/client';

export interface EpisodeArtifact {
  name: string;
  type: string;
  reference: string;
}

export interface EpisodeDecision {
  step: string;
  decision: string;
  rationale?: string;
}

export interface Episode {
  id: string;
  userId: string;
  goal: string;
  outcome: 'success' | 'failure' | 'partial';
  outcomeQuality: number;
  duration: number;
  steps: string[];
  decisions: EpisodeDecision[];
  errors: string[];
  learnings: string[];
  artifacts: EpisodeArtifact[];
  taskId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface EpisodeFilter {
  outcome?: 'success' | 'failure' | 'partial';
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
  minQuality?: number;
}

@Injectable()
export class EpisodicMemoryService {
  private readonly logger = new Logger(EpisodicMemoryService.name);

  constructor(
    private prisma: PrismaService,
    private memoryService: MemoryService,
  ) {}

  async storeEpisode(
    userId: string,
    sessionData: {
      goal: string;
      steps: string[];
      decisions: EpisodeDecision[];
      errors: string[];
      duration: number;
      taskId?: string;
      metadata?: Record<string, any>;
    },
    outcome: 'success' | 'failure' | 'partial',
    outcomeQuality?: number,
    learnings?: string[],
    artifacts?: EpisodeArtifact[],
  ): Promise<Episode> {
    const quality = outcomeQuality ?? (outcome === 'success' ? 0.85 : outcome === 'partial' ? 0.5 : 0.2);
    const importance = outcome === 'success' ? 0.9 : outcome === 'partial' ? 0.6 : 0.5;

    const episode: Episode = {
      id: '',
      userId,
      goal: sessionData.goal,
      outcome,
      outcomeQuality: quality,
      duration: sessionData.duration,
      steps: sessionData.steps,
      decisions: sessionData.decisions,
      errors: sessionData.errors,
      learnings: learnings ?? [],
      artifacts: artifacts ?? [],
      taskId: sessionData.taskId,
      metadata: sessionData.metadata,
      createdAt: new Date().toISOString(),
    };

    const memory = await this.memoryService.store(
      userId,
      JSON.stringify(episode),
      'EPISODIC' as MemoryType,
      {
        summary: `Episode: ${outcome} — ${sessionData.goal.substring(0, 120)}`,
        importance,
        taskId: sessionData.taskId,
        metadata: {
          outcome,
          outcomeQuality: quality,
          duration: sessionData.duration,
          stepCount: sessionData.steps.length,
          errorCount: sessionData.errors.length,
          learningCount: (learnings ?? []).length,
        },
      },
    );

    episode.id = memory.id;
    await this.prisma.memory.update({
      where: { id: memory.id },
      data: { content: JSON.stringify(episode) },
    });

    this.logger.debug(`Stored ${outcome} episode ${memory.id} for user ${userId}`);
    return episode;
  }

  async getEpisode(episodeId: string): Promise<Episode> {
    const memory = await this.prisma.memory.findUnique({ where: { id: episodeId } });
    if (!memory || memory.deletedAt || memory.type !== ('EPISODIC' as MemoryType)) {
      throw new NotFoundException(`Episode ${episodeId} not found`);
    }
    return this.parseEpisode(memory.content);
  }

  async getEpisodes(userId: string, filter?: EpisodeFilter): Promise<{ data: Episode[]; total: number }> {
    const limit = filter?.limit ?? 20;
    const offset = filter?.offset ?? 0;

    const where: any = {
      userId,
      type: 'EPISODIC' as MemoryType,
      deletedAt: null,
    };

    if (filter?.outcome) {
      where.metadata = { path: ['outcome'], equals: filter.outcome };
    }

    if (filter?.dateFrom || filter?.dateTo) {
      if (filter.dateFrom) where.createdAt = { ...where.createdAt, gte: new Date(filter.dateFrom) };
      if (filter.dateTo) where.createdAt = { ...where.createdAt, lte: new Date(filter.dateTo) };
    }

    if (filter?.minQuality !== undefined) {
      where.metadata = {
        ...where.metadata,
        path: ['outcomeQuality'],
        gte: filter.minQuality,
      };
    }

    const [memories, total] = await Promise.all([
      this.prisma.memory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.memory.count({ where }),
    ]);

    return {
      data: memories.map((m) => this.parseEpisode(m.content)),
      total,
    };
  }

  private parseEpisode(content: string): Episode {
    try {
      const parsed = JSON.parse(content) as Episode;
      return {
        ...parsed,
        steps: parsed.steps || [],
        decisions: parsed.decisions || [],
        errors: parsed.errors || [],
        learnings: parsed.learnings || [],
        artifacts: parsed.artifacts || [],
      };
    } catch {
      throw new Error(`Failed to parse episode: ${content.substring(0, 100)}`);
    }
  }
}
