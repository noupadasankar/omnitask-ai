import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from './memory.service';
import { MemoryType } from '@prisma/client';

export interface SemanticFact {
  id: string;
  userId: string;
  topic: string;
  fact: string;
  confidence: number;
  source: string;
  contradicts: string[];
  supersededBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredFact {
  id: string;
  userId: string;
  topic: string;
  fact: string;
  confidence: number;
  source: string;
  contradicts: string[];
  supersededBy: string | null;
}

@Injectable()
export class SemanticMemoryService {
  private readonly logger = new Logger(SemanticMemoryService.name);

  constructor(
    private prisma: PrismaService,
    private memoryService: MemoryService,
  ) {}

  async storeFact(
    userId: string,
    topic: string,
    fact: string,
    confidence: number,
    source: string,
  ): Promise<SemanticFact> {
    const existingFacts = await this.retrieveFacts(userId, topic);
    const contradiction = existingFacts.find((f) => this.isContradictory(f.fact, fact));

    if (contradiction) {
      const resolved = this.resolveConflict(contradiction, { id: '', userId, topic, fact, confidence, source, contradicts: [], supersededBy: null });
      if (!resolved.keepNew) {
        this.logger.debug(`Suppressed new fact — existing fact has higher confidence: "${fact.substring(0, 60)}"`);
        throw new ConflictException(
          `Fact conflicts with existing fact "${contradiction.fact.substring(0, 60)}..." ` +
          `(existing confidence=${contradiction.confidence}, new confidence=${confidence})`,
        );
      }
      await this.prisma.memory.update({
        where: { id: contradiction.id },
        data: {
          metadata: { ...(contradiction as any).metadata, supersededBy: 'pending' },
        },
      });
    }

    const factData: StoredFact = {
      id: '',
      userId,
      topic,
      fact,
      confidence,
      source,
      contradicts: contradiction ? [contradiction.id] : [],
      supersededBy: null,
    };

    const memory = await this.memoryService.store(userId, JSON.stringify(factData), 'SEMANTIC' as MemoryType, {
      summary: `[${topic}] ${fact.substring(0, 120)}`,
      importance: confidence,
      metadata: { topic, confidence, source, isFact: true },
    });

    factData.id = memory.id;
    await this.prisma.memory.update({
      where: { id: memory.id },
      data: { content: JSON.stringify(factData) },
    });

    if (contradiction) {
      const existingContent = JSON.parse((await this.prisma.memory.findUnique({ where: { id: contradiction.id } }))!.content);
      existingContent.supersededBy = memory.id;
      await this.prisma.memory.update({
        where: { id: contradiction.id },
        data: {
          content: JSON.stringify(existingContent),
          importance: 0.3,
          metadata: { ...((contradiction as any).metadata || {}), supersededBy: memory.id },
        },
      });
    }

    this.logger.debug(`Stored fact [${topic}]: ${fact.substring(0, 60)}`);
    return { ...factData, createdAt: memory.createdAt.toISOString(), updatedAt: memory.createdAt.toISOString() };
  }

  async retrieveFacts(userId: string, topic?: string): Promise<SemanticFact[]> {
    const where: any = {
      userId,
      type: 'SEMANTIC' as MemoryType,
      deletedAt: null,
      metadata: { path: ['isFact'], equals: true },
    };

    if (topic) {
      where.metadata = { path: ['topic'], equals: topic };
    }

    const memories = await this.prisma.memory.findMany({
      where,
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });

    return memories.map((m) => {
      const parsed = this.parseFact(m.content, m.id);
      return { ...parsed, createdAt: m.createdAt.toISOString(), updatedAt: m.createdAt.toISOString() };
    }).filter((f) => !f.supersededBy);
  }

  async retrieveRelevantFacts(userId: string, query: string, limit = 10): Promise<SemanticFact[]> {
    const where: any = {
      userId,
      type: 'SEMANTIC' as MemoryType,
      deletedAt: null,
      metadata: { path: ['isFact'], equals: true },
      OR: [
        { content: { contains: query, mode: 'insensitive' as const } },
        { summary: { contains: query, mode: 'insensitive' as const } },
      ],
    };

    const memories = await this.prisma.memory.findMany({
      where,
      orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return memories.map((m) => {
      const parsed = this.parseFact(m.content, m.id);
      return { ...parsed, createdAt: m.createdAt.toISOString(), updatedAt: m.createdAt.toISOString() };
    }).filter((f) => !f.supersededBy);
  }

  async getAllTopics(userId: string): Promise<string[]> {
    const memories = await this.prisma.memory.findMany({
      where: {
        userId,
        type: 'SEMANTIC' as MemoryType,
        deletedAt: null,
        metadata: { path: ['isFact'], equals: true },
      },
      select: { metadata: true },
      distinct: ['metadata'],
    });

    const topics = new Set<string>();
    for (const m of memories) {
      const topic = (m.metadata as any)?.topic;
      if (topic) topics.add(topic);
    }
    return Array.from(topics).sort();
  }

  async deduplicateFacts(userId: string): Promise<number> {
    const facts = await this.retrieveFacts(userId);
    const topicGroups = new Map<string, SemanticFact[]>();

    for (const fact of facts) {
      const existing = topicGroups.get(fact.topic) || [];
      existing.push(fact);
      topicGroups.set(fact.topic, existing);
    }

    let removed = 0;

    for (const [, group] of topicGroups) {
      if (group.length < 2) continue;

      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (this.isNearlyIdentical(group[i].fact, group[j].fact)) {
            const lowerConf = group[i].confidence <= group[j].confidence ? group[i] : group[j];
            await this.prisma.memory.update({
              where: { id: lowerConf.id },
              data: { deletedAt: new Date() },
            });
            removed++;
          }
        }
      }
    }

    if (removed > 0) {
      this.logger.debug(`Deduplication removed ${removed} redundant facts for user ${userId}`);
    }
    return removed;
  }

  private resolveConflict(
    existing: StoredFact,
    incoming: StoredFact,
  ): { keepNew: boolean; reason: string } {
    if (incoming.confidence > existing.confidence + 0.2) {
      return { keepNew: true, reason: `New fact has significantly higher confidence (${incoming.confidence} vs ${existing.confidence})` };
    }
    if (incoming.source === 'explicit' && existing.source !== 'explicit') {
      return { keepNew: true, reason: 'User-declared facts override inferred facts' };
    }
    if (existing.confidence > incoming.confidence) {
      return { keepNew: false, reason: `Existing fact has higher confidence (${existing.confidence} vs ${incoming.confidence})` };
    }
    return { keepNew: true, reason: 'Newer fact with comparable confidence' };
  }

  private isContradictory(factA: string, factB: string): boolean {
    const a = factA.toLowerCase().trim();
    const b = factB.toLowerCase().trim();
    if (a === b) return false;

    const negationWords = ['not ', "don't ", "doesn't ", "isn't ", "won't ", "can't ", 'never ', 'no '];
    const aNegated = negationWords.some((w) => a.includes(w));
    const bNegated = negationWords.some((w) => b.includes(w));

    if (aNegated !== bNegated) {
      const aCore = negationWords.reduce((s, w) => s.replace(w, ''), a);
      const bCore = negationWords.reduce((s, w) => s.replace(w, ''), b);
      if (aCore === bCore || a.includes(bCore) || b.includes(aCore)) return true;
    }

    return false;
  }

  private isNearlyIdentical(factA: string, factB: string): boolean {
    const a = factA.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const b = factB.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;
    let matches = 0;
    for (const ch of shorter) {
      if (longer.includes(ch)) matches++;
    }
    return matches / shorter.length > 0.9;
  }

  private parseFact(content: string, id: string): StoredFact {
    try {
      const parsed = JSON.parse(content);
      return {
        id: parsed.id || id,
        userId: parsed.userId || '',
        topic: parsed.topic || 'uncategorized',
        fact: parsed.fact || content,
        confidence: parsed.confidence ?? 0.5,
        source: parsed.source || 'inference',
        contradicts: parsed.contradicts || [],
        supersededBy: parsed.supersededBy || null,
      };
    } catch {
      return { id, userId: '', topic: 'uncategorized', fact: content, confidence: 0.5, source: 'unknown', contradicts: [], supersededBy: null };
    }
  }
}
