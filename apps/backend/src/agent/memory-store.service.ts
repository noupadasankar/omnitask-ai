// backend/src/agent/memory-store.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import {
  AgentMemory as IAgentMemory,
  AgentMemoryType,
} from '../shared/interfaces/agent.interfaces';

interface WorkingMemory {
  [key: string]: any;
}

@Injectable()
export class MemoryStoreService {
  private readonly logger = new Logger(MemoryStoreService.name);
  private openai: OpenAI;
  private workingMemory: WorkingMemory = {};

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async store(
    userId: string,
    type: AgentMemoryType,
    key: string,
    content: string,
    importance: number = 0.5,
    expiresInDays?: number,
  ): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(content);

      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      await this.prisma.agentMemory.create({
        data: {
          userId,
          type,
          key,
          content,
          embedding,
          importance,
          expiresAt,
          accessCount: 0,
          lastAccessedAt: new Date(),
        },
      });

      this.logger.debug(`Stored ${type} memory: ${key}`);
    } catch (error: any) {
      this.logger.error(`Failed to store memory: ${error.message}`);
    }
  }

  async recall(
    userId: string,
    query: string,
    options: {
      type?: AgentMemoryType;
      limit?: number;
      similarityThreshold?: number;
    } = {},
  ): Promise<IAgentMemory[]> {
    try {
      const {
        type,
        limit = 5,
        similarityThreshold = 0.7,
      } = options;

      const queryEmbedding = await this.generateEmbedding(query);

      const memories = type
        ? await this.prisma.agentMemory.findMany({
            where: { userId, type },
            orderBy: { importance: 'desc' },
            take: limit * 2,
          })
        : await this.prisma.agentMemory.findMany({
            where: { userId },
            orderBy: { importance: 'desc' },
            take: limit * 2,
          });

      const scored = memories.map((m: any) => {
        const similarity = this.cosineSimilarity(
          queryEmbedding,
          (m.embedding as any) || [],
        );
        return { memory: m, similarity };
      });

      const filtered = scored
        .filter((s: any) => s.similarity >= similarityThreshold)
        .sort((a: any, b: any) => b.similarity - a.similarity)
        .slice(0, limit)
        .map((s: any) => s.memory);

      for (const memory of filtered) {
        await this.prisma.agentMemory.update({
          where: { id: memory.id },
          data: {
            accessCount: { increment: 1 },
            lastAccessedAt: new Date(),
          },
        });
      }

      return filtered as IAgentMemory[];
    } catch (error: any) {
      this.logger.error(`Memory recall failed: ${error.message}`);
      return [];
    }
  }

  storeWorking(key: string, value: any): void {
    this.workingMemory[key] = {
      value,
      timestamp: Date.now(),
    };
    this.logger.debug(`Stored working memory: ${key}`);
  }

  getWorking(key: string): any {
    const entry = this.workingMemory[key];
    return entry?.value;
  }

  getAllWorking(): WorkingMemory {
    const result: WorkingMemory = {};
    for (const [key, entry] of Object.entries(this.workingMemory)) {
      result[key] = entry.value;
    }
    return result;
  }

  clearWorking(key?: string): void {
    if (key) {
      delete this.workingMemory[key];
    } else {
      this.workingMemory = {};
    }
  }

  async storeExecutionEpisode(
    userId: string,
    goal: string,
    steps: any[],
    success: boolean,
    duration: number,
  ): Promise<void> {
    const episodeData = {
      goal,
      success,
      duration,
      stepCount: steps.length,
      stepsSummary: steps.map((s: any) => `${s.action}(${s.target})`).join(' → '),
    };

    await this.store(
      userId,
      'EPISODIC',
      `execution:${Date.now()}`,
      JSON.stringify(episodeData),
      success ? 0.8 : 0.5,
      90,
    );
  }

  async storeLearning(
    userId: string,
    topic: string,
    content: string,
    importance: number,
  ): Promise<void> {
    await this.store(userId, 'SEMANTIC', topic, content, importance);
  }

  async storeProcedure(
    userId: string,
    procedureName: string,
    steps: string[],
  ): Promise<void> {
    const procedureContent = steps.join('\n');
    await this.store(userId, 'PROCEDURAL', procedureName, procedureContent, 0.9);
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return response.data[0]?.embedding || [];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 0;

    const dotProduct = a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }
}
