import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LLM_MODEL, LLM_MODEL_MINI, LLM_VISION_MODEL } from '../llm-config';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Cost per 1K tokens for various models (in USD).
 * Falls back to OpenAI pricing when model is unknown.
 */
const MODEL_COST_PER_1K_INPUT: Record<string, number> = {
  'llama-3.3-70b-versatile': 0.00059,
  'llama-3.1-8b-instant': 0.00005,
  'gemma2-9b-it': 0.00010,
  'mixtral-8x7b-32768': 0.00024,
  // Groq free models
  'llama-3.2-90b-vision-preview': 0.00090,
  // OpenAI models
  'gpt-4o': 0.00250,
  'gpt-4o-mini': 0.00015,
  'gpt-4-turbo': 0.01000,
  // Default fallback cost
  _default: 0.00100,
};

const MODEL_COST_PER_1K_OUTPUT: Record<string, number> = {
  'llama-3.3-70b-versatile': 0.00079,
  'llama-3.1-8b-instant': 0.00005,
  'gemma2-9b-it': 0.00010,
  'mixtral-8x7b-32768': 0.00024,
  'llama-3.2-90b-vision-preview': 0.00090,
  'gpt-4o': 0.01000,
  'gpt-4o-mini': 0.00060,
  'gpt-4-turbo': 0.03000,
  _default: 0.00200,
};

/**
 * Centralized LLM client — single provider-agnostic OpenAI instance.
 * All services inject this instead of constructing their own client.
 *
 * Defaults to Groq (free tier) when GROQ_API_KEY is set, falls back to
 * OpenRouter or OpenAI. Override baseURL via LLM_BASE_URL.
 *
 * Tracks token usage per-call and persists to LlmUsage table for cost
 * monitoring and quota enforcement.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI | null = null;
  private readonly apiKey: string | undefined;
  private readonly baseURL: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiKey =
      this.configService.get<string>('GROQ_API_KEY') ||
      this.configService.get<string>('OPENROUTER_API_KEY') ||
      this.configService.get<string>('OPENAI_API_KEY');

    const explicitBaseURL = this.configService.get<string>('LLM_BASE_URL');
    const groqKey = this.configService.get<string>('GROQ_API_KEY');

    this.baseURL = explicitBaseURL || (groqKey ? 'https://api.groq.com/openai/v1' : undefined);

    if (this.apiKey) {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
      });
      this.logger.log(`LlmService initialized: baseURL=${this.baseURL || 'default'}, model=${LLM_MODEL}`);
    } else {
      this.logger.warn('No LLM API key found (GROQ_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY). LLM features disabled.');
    }
  }

  /**
   * True when an API key is present and the client is ready.
   * Services should check this and degrade gracefully when false.
   */
  get available(): boolean {
    return this.client !== null;
  }

  /**
   * Returns the configured OpenAI client (compatible with Groq/OpenRouter).
   * Throws if no key is set — prefer checking `available` first.
   */
  getClient(): OpenAI {
    if (!this.client) {
      throw new Error('LlmService unavailable: no API key configured');
    }
    return this.client;
  }

  /**
   * Main chat model (reasoning, orchestration, high-stakes calls).
   */
  get chatModel(): string {
    return LLM_MODEL;
  }

  /**
   * Cheaper/faster model (summaries, metadata, reflection, low-stakes calls).
   */
  get miniModel(): string {
    return LLM_MODEL_MINI;
  }

  /**
   * Vision-capable model (screenshot analysis, OCR, visual grounding).
   */
  get visionModel(): string {
    return LLM_VISION_MODEL;
  }

  /**
   * Calculate estimated cost for a model and token counts.
   */
  private estimateCost(model: string, promptTokens: number, completionTokens: number): number {
    const inputCost = (MODEL_COST_PER_1K_INPUT[model] ?? MODEL_COST_PER_1K_INPUT._default) * promptTokens / 1000;
    const outputCost = (MODEL_COST_PER_1K_OUTPUT[model] ?? MODEL_COST_PER_1K_OUTPUT._default) * completionTokens / 1000;
    return Math.round((inputCost + outputCost) * 100000) / 100000;
  }

  /**
   * Persist a usage record to the LlmUsage table.
   */
  private async recordUsage(params: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    durationMs: number;
    endpoint: string;
    userId?: string;
    sessionId?: string;
    taskId?: string;
    metadata?: any;
  }): Promise<void> {
    try {
      await this.prisma.llmUsage.create({
        data: {
          model: params.model,
          promptTokens: params.promptTokens,
          completionTokens: params.completionTokens,
          totalTokens: params.totalTokens,
          cost: this.estimateCost(params.model, params.promptTokens, params.completionTokens),
          durationMs: params.durationMs,
          endpoint: params.endpoint,
          userId: params.userId,
          sessionId: params.sessionId,
          taskId: params.taskId,
          metadata: params.metadata,
        },
      });
    } catch (error: any) {
      this.logger.warn(`Failed to record LLM usage: ${error.message}`);
    }
  }

  /**
   * Convenience helper: chat completion with response_format: json_object.
   * Returns the parsed JSON or null on error.
   */
  async chatJSON<T = any>(params: {
    model?: string;
    messages: OpenAI.ChatCompletionMessageParam[];
    temperature?: number;
    max_tokens?: number;
    userId?: string;
    sessionId?: string;
    taskId?: string;
  }): Promise<T | null> {
    if (!this.available) return null;
    const start = Date.now();
    try {
      const response = await this.client!.chat.completions.create({
        model: params.model || this.chatModel,
        messages: params.messages,
        temperature: params.temperature ?? 0.1,
        max_tokens: params.max_tokens,
        response_format: { type: 'json_object' },
      });
      const content = response.choices[0]?.message?.content;
      const usage = response.usage;
      if (usage) {
        this.recordUsage({
          model: params.model || this.chatModel,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          durationMs: Date.now() - start,
          endpoint: 'chatJSON',
          userId: params.userId,
          sessionId: params.sessionId,
          taskId: params.taskId,
        });
      }
      return content ? JSON.parse(content) : null;
    } catch (error: any) {
      this.logger.error(`chatJSON failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Convenience helper: standard chat completion.
   * Returns the content string or null on error.
   */
  async chat(params: {
    model?: string;
    messages: OpenAI.ChatCompletionMessageParam[];
    temperature?: number;
    max_tokens?: number;
    userId?: string;
    sessionId?: string;
    taskId?: string;
  }): Promise<string | null> {
    if (!this.available) return null;
    const start = Date.now();
    try {
      const response = await this.client!.chat.completions.create({
        model: params.model || this.chatModel,
        messages: params.messages,
        temperature: params.temperature ?? 0.2,
        max_tokens: params.max_tokens,
      });
      const content = response.choices[0]?.message?.content || null;
      const usage = response.usage;
      if (usage) {
        this.recordUsage({
          model: params.model || this.chatModel,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          durationMs: Date.now() - start,
          endpoint: 'chat',
          userId: params.userId,
          sessionId: params.sessionId,
          taskId: params.taskId,
        });
      }
      return content;
    } catch (error: any) {
      this.logger.error(`chat failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Get usage statistics for a user or time period.
   */
  async getUsageStats(params: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    model?: string;
  } = {}) {
    const where: any = {};
    if (params.userId) where.userId = params.userId;
    if (params.model) where.model = params.model;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = params.startDate;
      if (params.endDate) where.createdAt.lte = params.endDate;
    }

    const [totalUsage, modelBreakdown, dailyUsage] = await Promise.all([
      this.prisma.llmUsage.aggregate({
        where,
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true, cost: true },
        _count: true,
      }),
      this.prisma.llmUsage.groupBy({
        by: ['model'],
        where,
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true, cost: true },
        _count: true,
      }),
      this.prisma.llmUsage.groupBy({
        by: ['createdAt'],
        where,
        _sum: { totalTokens: true, cost: true },
        _count: true,
      }),
    ]);

    return {
      totalCalls: totalUsage._count,
      totalTokens: totalUsage._sum.totalTokens || 0,
      totalCost: Math.round((totalUsage._sum.cost || 0) * 100000) / 100000,
      modelBreakdown: modelBreakdown.map((m: any) => ({
        model: m.model,
        calls: m._count,
        tokens: m._sum.totalTokens || 0,
        cost: Math.round((m._sum.cost || 0) * 100000) / 100000,
      })),
      dailyUsage: dailyUsage.map((d: any) => ({
        date: d.createdAt,
        calls: d._count,
        tokens: d._sum.totalTokens || 0,
        cost: Math.round((d._sum.cost || 0) * 100000) / 100000,
      })),
    };
  }
}
