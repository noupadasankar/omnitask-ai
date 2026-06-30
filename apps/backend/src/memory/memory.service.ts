import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryType } from '@prisma/client';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(private prisma: PrismaService) {}

  async store(userId: string, content: string, type: MemoryType, opts: {
    taskId?: string;
    summary?: string;
    importance?: number;
    metadata?: any;
  } = {}): Promise<any> {
    const memory = await this.prisma.memory.create({
      data: {
        userId,
        content,
        type,
        taskId: opts.taskId,
        summary: opts.summary,
        importance: opts.importance || 0.5,
        metadata: opts.metadata,
      },
    });
    return memory;
  }

  async retrieveRelevant(userId: string, query: string, opts: {
    type?: MemoryType;
    limit?: number;
  } = {}): Promise<any[]> {
    const memories = await this.prisma.memory.findMany({
      where: {
        userId,
        type: opts.type,
        OR: [
          { content: { contains: query, mode: 'insensitive' } },
          { summary: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit || 10,
    });
    return memories;
  }

  async getRecent(userId: string, limit = 10): Promise<any[]> {
    return this.prisma.memory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getRecentPaginated(userId: string, cursor?: string, take: number = 20) {
    const pageSize = Math.min(take, 100);
    const decodedCursor = cursor
      ? (() => { try { return Buffer.from(cursor, 'base64url').toString('utf-8'); } catch { return undefined; } })()
      : undefined;

    const items = await this.prisma.memory.findMany({
      take: pageSize + 1,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = items.length > pageSize;
    const data = hasMore ? items.slice(0, pageSize) : items;
    const last = data[data.length - 1];
    return {
      data,
      nextCursor: last && hasMore ? Buffer.from(last.id, 'utf-8').toString('base64url') : null,
      hasMore,
    };
  }
}