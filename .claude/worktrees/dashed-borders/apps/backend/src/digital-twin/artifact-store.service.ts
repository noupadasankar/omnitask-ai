import { Injectable, Logger } from '@nestjs/common';
import { ArtifactKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordArtifactInput {
  userId: string;
  sessionId?: string;
  agent?: string;
  kind?: ArtifactKind;
  title: string;
  mimeType?: string;
  text?: string;
  data?: unknown;
  storageKey?: string;
  tags?: string[];
}

export interface ArtifactQuery {
  kind?: ArtifactKind;
  tag?: string;
  q?: string;
  sessionId?: string;
  take?: number;
}

/**
 * Digital Twin artifact store (shared service).
 *
 * Versioned, queryable storage for everything agents produce — structured
 * result sets, reports, extracted documents, screenshots. Each record with a
 * repeated (userId, title) bumps `version`, giving an immutable history.
 * Semantic/vector search is a future enhancement; today we support exact
 * kind/tag filters and case-insensitive title/text contains.
 */
@Injectable()
export class ArtifactStoreService {
  private readonly logger = new Logger(ArtifactStoreService.name);

  constructor(private prisma: PrismaService) {}

  async record(input: RecordArtifactInput) {
    const prior = await this.prisma.artifact.count({
      where: { userId: input.userId, title: input.title },
    });

    const artifact = await this.prisma.artifact.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId ?? null,
        agent: input.agent ?? null,
        kind: input.kind ?? 'DATA',
        title: input.title,
        mimeType: input.mimeType ?? 'application/json',
        text: input.text ?? null,
        data:
          input.data === undefined
            ? undefined
            : (input.data as unknown as Prisma.InputJsonValue),
        storageKey: input.storageKey ?? null,
        tags: input.tags ?? [],
        version: prior + 1,
      },
    });

    this.logger.log(
      `[DigitalTwin] +artifact ${artifact.kind} "${artifact.title}" v${artifact.version} (session=${input.sessionId ?? '—'})`,
    );
    return artifact;
  }

  async get(userId: string, id: string) {
    const artifact = await this.prisma.artifact.findUnique({ where: { id } });
    if (!artifact || artifact.userId !== userId) return null;
    return artifact;
  }

  async search(userId: string, query: ArtifactQuery = {}) {
    const where: Prisma.ArtifactWhereInput = { userId };
    if (query.kind) where.kind = query.kind;
    if (query.sessionId) where.sessionId = query.sessionId;
    if (query.tag) where.tags = { has: query.tag };
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { text: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    return this.prisma.artifact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.take ?? 100, 200),
    });
  }

  /** Full version history for a titled artifact (newest first). */
  async versions(userId: string, title: string) {
    return this.prisma.artifact.findMany({
      where: { userId, title },
      orderBy: { version: 'desc' },
    });
  }

  async stats(userId: string) {
    const rows = await this.prisma.artifact.groupBy({
      by: ['kind'],
      where: { userId },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.kind] = r._count._all;
    return counts;
  }
}
