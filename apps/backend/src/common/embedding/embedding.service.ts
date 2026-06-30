import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Single source of truth for text embeddings + vector similarity.
 *
 * Previously every cognitive service (memory-store, strategy-memory, reflection,
 * drift-detector, …) constructed its own OpenAI client and hand-rolled identical
 * `generateEmbedding` / `cosineSimilarity` helpers. Centralizing here means the
 * embedding model and similarity maths cannot drift between subsystems.
 *
 * Provider (EMBEDDING_PROVIDER env):
 *   - "local"  (default): runs all-MiniLM-L6-v2 in-process via transformers.js.
 *               384-dim, fully free, no API key, no network after first download.
 *   - "openai":           uses an OpenAI-compatible embeddings endpoint
 *               (text-embedding-3-small, 1536-dim) — needs a paid key.
 *
 * Embeddings are stored as Float[] with cosine computed in JS, so changing the
 * provider/dimension needs NO database migration. (Rows embedded under one model
 * simply won't match rows from another — re-embed or start fresh when switching.)
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly provider: string;

  // Local (transformers.js) state — lazily initialized on first use.
  private readonly localModel: string;
  private localPipeline: any = null;
  private localPipelinePromise: Promise<any> | null = null;
  private localFailed = false;

  // OpenAI-compatible state (only used when provider === "openai").
  private openai: OpenAI | null = null;
  private readonly openaiModel: string;

  // Embedding inputs are truncated to stay well under the model's token limit.
  private static readonly MAX_INPUT_CHARS = 8000;
  // Dimension of the hash fallback vector (matches MiniLM so vectors stay comparable).
  private static readonly FALLBACK_DIM = 384;

  constructor(private readonly configService: ConfigService) {
    this.provider = (
      this.configService.get<string>('EMBEDDING_PROVIDER') || 'local'
    ).toLowerCase();

    this.localModel =
      this.configService.get<string>('EMBEDDING_MODEL_LOCAL') || 'Xenova/all-MiniLM-L6-v2';
    this.openaiModel =
      this.configService.get<string>('EMBEDDING_MODEL') || 'text-embedding-3-small';

    if (this.provider === 'openai') {
      const apiKey =
        this.configService.get<string>('OPENAI_API_KEY') ||
        this.configService.get<string>('OPENROUTER_API_KEY');
      const baseURL = this.configService.get<string>('EMBEDDING_BASE_URL') || undefined;
      this.openai = new OpenAI({ apiKey, baseURL });
      this.logger.log(`EmbeddingService: provider=openai, model=${this.openaiModel}`);
    } else {
      this.logger.log(`EmbeddingService: provider=local, model=${this.localModel}`);
    }
  }

  /**
   * Embed a single string. Returns an empty vector on hard failure so callers can
   * degrade gracefully (similarity against [] is 0) rather than throw.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const input = (text || '').slice(0, EmbeddingService.MAX_INPUT_CHARS);
    if (!input.trim()) return [];

    if (this.provider === 'openai') {
      return this.embedOpenAI(input);
    }
    return this.embedLocal(input);
  }

  /** Local MiniLM embedding via transformers.js (free, offline after first load). */
  private async embedLocal(input: string): Promise<number[]> {
    try {
      const pipe = await this.getLocalPipeline();
      if (!pipe) return this.hashEmbedding(input);

      // mean-pooled + normalized sentence embedding
      const output = await pipe(input, { pooling: 'mean', normalize: true });
      return Array.from(output.data as Float32Array);
    } catch (error: any) {
      this.logger.warn(`Local embedding failed (${error.message}); using hash fallback.`);
      return this.hashEmbedding(input);
    }
  }

  /** Lazy-load + cache the transformers.js feature-extraction pipeline. */
  private async getLocalPipeline(): Promise<any> {
    if (this.localPipeline) return this.localPipeline;
    if (this.localFailed) return null;
    if (this.localPipelinePromise) return this.localPipelinePromise;

    this.localPipelinePromise = (async () => {
      try {
        // Dynamic import: ESM-only package loaded from CommonJS via interop.
        const { pipeline, env } = await import('@xenova/transformers');
        // Allow remote model download on first run; cache locally thereafter.
        env.allowLocalModels = true;
        const pipe = await pipeline('feature-extraction', this.localModel);
        this.localPipeline = pipe;
        this.logger.log(`Local embedding model ready: ${this.localModel}`);
        return pipe;
      } catch (error: any) {
        this.localFailed = true;
        this.logger.error(
          `Failed to load local embedding model "${this.localModel}": ${error.message}. ` +
            `Falling back to deterministic hash embeddings (degraded semantic quality).`,
        );
        return null;
      }
    })();

    return this.localPipelinePromise;
  }

  /** OpenAI-compatible embeddings endpoint. */
  private async embedOpenAI(input: string): Promise<number[]> {
    if (!this.openai) return [];
    try {
      const response = await this.openai.embeddings.create({
        model: this.openaiModel,
        input,
      });
      return response.data[0]?.embedding || [];
    } catch (error: any) {
      this.logger.error(`OpenAI embedding generation failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Deterministic token-hash fallback embedding. Not semantically rich, but stable
   * and dependency-free — guarantees memory keeps working when the local model
   * can't load (e.g. offline first run, restricted environment).
   */
  private hashEmbedding(text: string): number[] {
    const dim = EmbeddingService.FALLBACK_DIM;
    const vec = new Array<number>(dim).fill(0);
    const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
    for (const token of tokens) {
      let h = 2166136261; // FNV-1a 32-bit
      for (let i = 0; i < token.length; i++) {
        h ^= token.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const idx = Math.abs(h) % dim;
      vec[idx] += 1;
    }
    // L2-normalize so cosine behaves consistently with the real model's output.
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (mag === 0) return vec;
    return vec.map((v) => v / mag);
  }

  /**
   * Cosine similarity in [0, 1]. Returns 0 for empty/degenerate vectors so an
   * unembeddable item never falsely ranks as a match.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (!a?.length || !b?.length) return 0;

    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
      const av = a[i];
      const bv = b[i] ?? 0;
      dot += av * bv;
      magA += av * av;
      magB += bv * bv;
    }

    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }
}
