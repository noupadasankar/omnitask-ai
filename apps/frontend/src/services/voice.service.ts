import { api } from './api';

export interface STTResult {
  text: string;
  confidence: number;
  durationMs: number;
  language?: string;
}

export interface TTSResult {
  text: string;
  audioUrl: string;
  durationMs: number;
  voice?: string;
}

export async function speechToText(audio: Blob, language?: string): Promise<STTResult> {
  const form = new FormData();
  form.append('audio', audio, 'recording.webm');
  if (language) form.append('language', language);
  const { data } = await api.post('/voice/stt', form);
  return data;
}

export async function textToSpeech(text: string, voice?: string): Promise<TTSResult> {
  const { data } = await api.post('/voice/tts', { text, voice });
  return data;
}

export async function processVoiceCommand(audio: Blob, opts?: { language?: string; sessionId?: string; wakeWordDetected?: boolean }): Promise<{ stt: STTResult; command: string }> {
  const form = new FormData();
  form.append('audio', audio, 'command.webm');
  if (opts?.language) form.append('language', opts.language);
  if (opts?.sessionId) form.append('sessionId', opts.sessionId);
  if (opts?.wakeWordDetected) form.append('wakeWordDetected', 'true');
  const { data } = await api.post('/voice/command', form);
  return data;
}

export async function getVoiceHistory(limit = 50): Promise<any[]> {
  const { data } = await api.get('/voice/history', { params: { limit } });
  return data;
}
