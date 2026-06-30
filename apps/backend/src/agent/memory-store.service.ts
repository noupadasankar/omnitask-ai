// backend/src/agent/memory-store.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../common/embedding/embedding.service';
import {
  AgentMemory as IAgentMemory,
  AgentMemoryType,
} from '../shared/interfaces/agent.interfaces';

interface WorkingMemoryEntry {
  value: any;
  timestamp: number;
}

@Injectable()
export class MemoryStoreService {
  private readonly logger = new Logger(MemoryStoreService.name);
  private readonly MAX_WORKING_ENTRIES = 1000;
  private workingMemory = new Map<string, WorkingMemoryEntry>();

  constructor(
    private prisma: PrismaService,
    private embeddings: EmbeddingService,
  ) {}

  async store(
    userId: string,
    type: AgentMemoryType,
    key: string,
    content: string,
    importance: number = 0.5,
    expiresInDays?: number,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      const embedding = await this.embeddings.generateEmbedding(content);

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
          ...(metadata !== undefined ? { metadata } : {}),
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

      const queryEmbedding = await this.embeddings.generateEmbedding(query);

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
        const similarity = this.embeddings.cosineSimilarity(
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

  private setWithEviction(key: string, entry: WorkingMemoryEntry): void {
    // If the key already exists it will be overwritten in-place; size stays the same.
    if (!this.workingMemory.has(key) && this.workingMemory.size >= this.MAX_WORKING_ENTRIES) {
      // Map iterates in insertion order — the first key is the oldest.
      const oldestKey = this.workingMemory.keys().next().value;
      if (oldestKey !== undefined) {
        this.workingMemory.delete(oldestKey);
        this.logger.warn(`Working-memory cap reached (${this.MAX_WORKING_ENTRIES}); evicted oldest key: ${oldestKey}`);
      }
    }
    this.workingMemory.set(key, entry);
  }

  storeWorking(key: string, value: any): void {
    this.setWithEviction(key, { value, timestamp: Date.now() });
    this.logger.debug(`Stored working memory: ${key}`);
  }

  getWorking(key: string): any {
    const entry = this.workingMemory.get(key);
    return entry?.value;
  }

  getAllWorking(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, entry] of this.workingMemory) {
      result[key] = entry.value;
    }
    return result;
  }

  clearWorking(key?: string): void {
    if (key) {
      this.workingMemory.delete(key);
    } else {
      this.workingMemory.clear();
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

  /**
   * Upsert a memory record using a deterministic composite id.
   * Used when callers need idempotent "create-or-update" semantics rather than
   * always creating a new row (e.g. per-user stat cards with a stable id).
   */
  async upsert(
    id: string,
    userId: string,
    type: AgentMemoryType,
    key: string,
    content: string,
    importance: number = 0.5,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.agentMemory.upsert({
        where: { id },
        update: {
          content,
          lastAccessedAt: new Date(),
          ...(importance !== undefined ? { importance } : {}),
          ...(metadata !== undefined ? { metadata } : {}),
        },
        create: {
          id,
          userId,
          type,
          key,
          content,
          embedding: [],
          importance,
          accessCount: 0,
          lastAccessedAt: new Date(),
          ...(metadata !== undefined ? { metadata } : {}),
        },
      });

      this.logger.debug(`Upserted ${type} memory: ${key} (id=${id})`);
    } catch (error: any) {
      this.logger.error(`Failed to upsert memory: ${error.message}`);
    }
  }

  /**
   * Increment the access counter and refresh lastAccessedAt for a recalled
   * memory record. Keeps access-tracking logic out of callers.
   */
  async touchAccess(id: string): Promise<void> {
    try {
      await this.prisma.agentMemory.update({
        where: { id },
        data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
      });
    } catch (error: any) {
      this.logger.error(`Failed to touch access for memory id=${id}: ${error.message}`);
    }
  }

}
