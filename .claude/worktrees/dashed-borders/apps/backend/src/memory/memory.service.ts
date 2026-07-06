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
}