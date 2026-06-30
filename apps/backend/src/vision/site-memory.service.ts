import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryStoreService } from '../agent/memory-store.service';

export interface SiteElementMapping {
  intentKey: string;
  label: string;
  selector: string;
  confidence: number;
  lastUsedAt: number;
}

export interface SiteKnowledge {
  siteId: string;
  mappings: Record<string, SiteElementMapping>;
  updatedAt: number;
}

@Injectable()
export class SiteMemoryService {
  private readonly logger = new Logger(SiteMemoryService.name);
  private cache = new Map<string, SiteKnowledge>();

  constructor(
    private prisma: PrismaService,
    private memoryStore: MemoryStoreService,
  ) {}

  private memoryId(siteId: string): string {
    return `site_knowledge_${siteId}`;
  }

  async getKnowledge(siteId: string): Promise<SiteKnowledge> {
    const cached = this.cache.get(siteId);
    if (cached) return cached;

    const memory = await this.prisma.agentMemory.findUnique({
      where: { id: this.memoryId(siteId) },
    });

    if (!memory) {
      return { siteId, mappings: {}, updatedAt: Date.now() };
    }

    try {
      const knowledge = JSON.parse(memory.content) as SiteKnowledge;
      this.cache.set(siteId, knowledge);
      return knowledge;
    } catch {
      return { siteId, mappings: {}, updatedAt: Date.now() };
    }
  }

  async lookupMapping(
    siteId: string,
    intentKey: string,
  ): Promise<SiteElementMapping | null> {
    const knowledge = await this.getKnowledge(siteId);
    const normalized = this.normalizeIntentKey(intentKey);
    return knowledge.mappings[normalized] || null;
  }

  /**
   * Store learned mapping, e.g. linkedin + "apply now" → Quick Apply selector.
   */
  async saveMapping(
    siteId: string,
    intentKey: string,
    label: string,
    selector: string,
    confidence: number,
  ): Promise<void> {
    const knowledge = await this.getKnowledge(siteId);
    const key = this.normalizeIntentKey(intentKey);

    knowledge.mappings[key] = {
      intentKey: key,
      label,
      selector,
      confidence,
      lastUsedAt: Date.now(),
    };
    knowledge.updatedAt = Date.now();

    await this.memoryStore.upsert(
      this.memoryId(siteId),
      'system',
      'SEMANTIC',
      `vision:site:${siteId}`,
      JSON.stringify(knowledge),
      0.85,
    );

    this.cache.set(siteId, knowledge);
    this.logger.log(`[SiteMemory] Saved ${siteId}/${key} → "${label}" (${selector})`);
  }

  normalizeIntentKey(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 64);
  }
}
