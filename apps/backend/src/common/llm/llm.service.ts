import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LLM_MODEL, LLM_MODEL_MINI, LLM_VISION_MODEL } from '../llm-config';

/**
 * Centralized LLM client — single provider-agnostic OpenAI instance.
 * All services inject this instead of constructing their own client.
 *
 * Defaults to Groq (free tier) when GROQ_API_KEY is set, falls back to
 * OpenRouter or OpenAI. Override baseURL via LLM_BASE_URL.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI | null = null;
  private readonly apiKey: string | undefined;
  private readonly baseURL: string | undefined;

  constructor(private readonly configService: ConfigService) {
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
   * Convenience helper: chat completion with response_format: json_object.
   * Returns the parsed JSON or null on error.
   */
  async chatJSON<T = any>(params: {
    model?: string;
    messages: OpenAI.ChatCompletionMessageParam[];
    temperature?: number;
    max_tokens?: number;
  }): Promise<T | null> {
    if (!this.available) return null;
    try {
      const response = await this.client!.chat.completions.create({
        model: params.model || this.chatModel,
        messages: params.messages,
        temperature: params.temperature ?? 0.1,
        max_tokens: params.max_tokens,
        response_format: { type: 'json_object' },
      });
      const content = response.choices[0]?.message?.content;
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
  }): Promise<string | null> {
    if (!this.available) return null;
    try {
      const response = await this.client!.chat.completions.create({
        model: params.model || this.chatModel,
        messages: params.messages,
        temperature: params.temperature ?? 0.2,
        max_tokens: params.max_tokens,
      });
      return response.choices[0]?.message?.content || null;
    } catch (error: any) {
      this.logger.error(`chat failed: ${error.message}`);
      return null;
    }
  }
}
