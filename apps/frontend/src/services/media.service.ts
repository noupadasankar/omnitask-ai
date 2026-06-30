import { api } from './api';

export interface MediaTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  url: string;
  thumbnail?: string;
  provider: string;
}

export async function searchMedia(query: string, type?: string, limit?: number) {
  const { data } = await api.get<MediaTrack[]>('/media/search', { params: { query, type, limit } });
  return data;
}

export async function playMedia(query?: string, trackId?: string, provider?: string) {
  const { data } = await api.post('/media/play', { query, trackId, provider });
  return data;
}

export async function queueMedia(trackId: string, provider?: string) {
  const { data } = await api.post('/media/queue', { trackId, provider });
  return data;
}

export async function pauseMedia(provider?: string) {
  const { data } = await api.post('/media/pause', { provider });
  return data;
}

export async function getMediaHistory(limit?: number) {
  const { data } = await api.get('/media/history', { params: { limit } });
  return data;
}
