import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../common/llm/llm.service';
import { LLM_MODEL_MINI } from '../common/llm-config';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const STORAGE_DIR = path.join(process.cwd(), 'storage', 'audio');

export interface STTResult {
  text: string;
  language: string;
  durationMs: number;
  sessionId?: string;
}

export interface TTSResult {
  audioUrl: string;
  durationMs: number;
  format: string;
  sessionId?: string;
}

const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ar'];
const WAKE_WORDS = ['hey omnitask', 'ok omnitask', 'omnitask'];

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  // Lazily-built dedicated OpenAI client for TTS only. Groq has no TTS endpoint,
  // so OpenAI TTS requires a genuine OPENAI_API_KEY (with OpenAI's default baseURL,
  // NOT the shared Groq client). ElevenLabs remains the primary TTS path.
  private openaiTtsClient: OpenAI | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private readonly llm: LlmService,
  ) {
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }

  /** Returns a genuine-OpenAI TTS client, or null when no OPENAI_API_KEY is configured. */
  private getOpenAiTtsClient(): OpenAI | null {
    if (this.openaiTtsClient) return this.openaiTtsClient;
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (!key) return null;
    this.openaiTtsClient = new OpenAI({ apiKey: key });
    return this.openaiTtsClient;
  }

  async speechToText(audioBuffer: Buffer, language?: string, sessionId?: string): Promise<STTResult> {
    const tempFile = path.join(STORAGE_DIR, `stt-${crypto.randomUUID()}.webm`);
    fs.writeFileSync(tempFile, audioBuffer);

    const startTime = Date.now();
    try {
      const transcription = await this.llm.getClient().audio.transcriptions.create({
        model: 'whisper-large-v3-turbo',
        file: fs.createReadStream(tempFile),
        language: language && SUPPORTED_LANGUAGES.includes(language) ? language : undefined,
        response_format: 'verbose_json',
      });

      const result: STTResult = {
        text: transcription.text,
        language: (transcription as any).language || language || 'en',
        durationMs: Date.now() - startTime,
        sessionId,
      };

      await this.prisma.voiceSession.create({
        data: { userId: 'system', sessionId, inputText: result.text, durationMs: result.durationMs, status: 'completed', wakeWord: this.detectWakeWord(result.text) },
      });

      return result;
    } finally {
      fs.unlinkSync(tempFile);
    }
  }

  async textToSpeech(text: string, voice = 'alloy', speed = 1, sessionId?: string): Promise<TTSResult> {
    const elevenLabsKey = this.config.get<string>('ELEVENLABS_API_KEY');
    const useElevenLabs = !!elevenLabsKey;

    if (useElevenLabs) {
      return this.elevenLabsTTS(text, sessionId);
    }
    return this.openAiTTS(text, voice, speed, sessionId);
  }

  async streamTTS(text: string, voice = 'alloy'): Promise<ReadableStream> {
    const elevenLabsKey = this.config.get<string>('ELEVENLABS_API_KEY');
    if (elevenLabsKey) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsKey,
        },
        body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.5 } }),
      });
      if (!res.ok) throw new Error(`ElevenLabs streaming failed: ${res.status}`);
      return res.body!;
    }

    const tts = this.getOpenAiTtsClient();
    if (!tts) {
      throw new Error(
        'TTS unavailable: set ELEVENLABS_API_KEY (recommended) or OPENAI_API_KEY. Groq does not provide a TTS endpoint.',
      );
    }
    const mp3 = await tts.audio.speech.create({
      model: 'tts-1',
      input: text,
      voice: voice as any,
      response_format: 'mp3',
    });
    return mp3.body as unknown as ReadableStream;
  }

  async processVoiceCommand(audioBuffer: Buffer, language?: string, wakeWordDetected?: boolean): Promise<{ transcript: string; command?: string; wakeWord: boolean }> {
    const stt = await this.speechToText(audioBuffer, language);
    const wakeWord = wakeWordDetected || this.detectWakeWord(stt.text);
    const cleanText = wakeWord ? this.stripWakeWord(stt.text) : stt.text;

    const prompt = `Extract the user's command from this voice input. Return only the command text.\nInput: "${cleanText}"`;
    try {
      const res = await this.llm.getClient().chat.completions.create({
        model: LLM_MODEL_MINI,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
      });
      return { transcript: stt.text, command: res.choices[0]?.message?.content?.trim(), wakeWord };
    } catch {
      return { transcript: stt.text, command: cleanText, wakeWord };
    }
  }

  async getHistory(userId: string, limit = 20) {
    return this.prisma.voiceSession.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async elevenLabsTTS(text: string, sessionId?: string): Promise<TTSResult> {
    const apiKey = this.config.get<string>('ELEVENLABS_API_KEY');
    const voiceId = this.config.get<string>('ELEVENLABS_VOICE_ID') || '21m00Tcm4TlvDq8ikWAM';
    const startTime = Date.now();

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey!,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${res.status}`);
    const audioBuffer = Buffer.from(await res.arrayBuffer());
    const fileName = `tts-${crypto.randomUUID()}.mp3`;
    const filePath = path.join(STORAGE_DIR, fileName);
    fs.writeFileSync(filePath, audioBuffer);

    const result: TTSResult = {
      audioUrl: `/storage/audio/${fileName}`,
      durationMs: Date.now() - startTime,
      format: 'mp3',
      sessionId,
    };

    await this.prisma.voiceSession.create({
      data: { userId: 'system', sessionId, outputText: text, audioUrl: result.audioUrl, durationMs: result.durationMs, status: 'completed' },
    });

    return result;
  }

  private async openAiTTS(text: string, voice: string, speed: number, sessionId?: string): Promise<TTSResult> {
    const startTime = Date.now();
    const tts = this.getOpenAiTtsClient();
    if (!tts) {
      throw new Error(
        'TTS unavailable: set ELEVENLABS_API_KEY (recommended) or OPENAI_API_KEY. Groq does not provide a TTS endpoint.',
      );
    }
    const mp3 = await tts.audio.speech.create({
      model: 'tts-1',
      input: text,
      voice: voice as any,
      speed,
      response_format: 'mp3',
    });

    const audioBuffer = Buffer.from(await mp3.arrayBuffer());
    const fileName = `tts-${crypto.randomUUID()}.mp3`;
    const filePath = path.join(STORAGE_DIR, fileName);
    fs.writeFileSync(filePath, audioBuffer);

    const result: TTSResult = {
      audioUrl: `/storage/audio/${fileName}`,
      durationMs: Date.now() - startTime,
      format: 'mp3',
      sessionId,
    };

    await this.prisma.voiceSession.create({
      data: { userId: 'system', sessionId, outputText: text, audioUrl: result.audioUrl, durationMs: result.durationMs, status: 'completed' },
    });

    return result;
  }

  private detectWakeWord(text: string): boolean {
    const lower = text.toLowerCase();
    return WAKE_WORDS.some((w) => lower.startsWith(w) || lower.includes(w));
  }

  private stripWakeWord(text: string): string {
    const lower = text.toLowerCase();
    for (const w of WAKE_WORDS) {
      if (lower.startsWith(w)) return text.slice(w.length).trim();
      const idx = lower.indexOf(w);
      if (idx >= 0) return text.slice(idx + w.length).trim();
    }
    return text;
  }
}
