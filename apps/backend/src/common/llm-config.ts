/**
 * Central LLM model configuration.
 * All services must import from here instead of hardcoding model strings,
 * so a single env-var change swaps the model across the whole backend.
 *
 * Defaults to Groq free-tier models (fast, capable, no cost):
 *   llama-3.3-70b-versatile                      (main: reasoning, orchestration)
 *   llama-3.1-8b-instant                         (mini: summaries, metadata)
 *   meta-llama/llama-4-scout-17b-16e-instruct    (vision: screenshot analysis)
 *
 * Override via OPENROUTER_MODEL (OpenRouter), or set LLM_BASE_URL +
 * OPENAI_API_KEY to use OpenAI directly.
 */
export const LLM_MODEL: string =
  process.env.OPENROUTER_MODEL || 'llama-3.3-70b-versatile';

/**
 * Cheaper/faster model for low-stakes calls (summaries, metadata, reflection).
 */
export const LLM_MODEL_MINI: string =
  process.env.OPENROUTER_MODEL_MINI || process.env.OPENROUTER_MODEL || 'llama-3.1-8b-instant';

/**
 * Vision-capable model for screenshot analysis, OCR, visual grounding.
 */
export const LLM_VISION_MODEL: string =
  process.env.LLM_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
