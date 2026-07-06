import { api } from './api';

export interface SocialPost {
  id: string;
  platform: string;
  content: string;
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED';
  likes: number;
  shares: number;
  comments: number;
  views: number;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
}

export async function getSocialPosts(status?: string): Promise<SocialPost[]> {
  const { data } = await api.get<SocialPost[]>('/social/posts', {
    params: status ? { status } : undefined,
  });
  return data;
}

export async function generateSocialPost(topic: string, platform: string, tone?: string): Promise<SocialPost> {
  const { data } = await api.post<SocialPost>('/social/posts/generate', { topic, platform, tone });
  return data;
}

export async function scheduleSocialPost(postId: string, scheduledAt: string): Promise<SocialPost> {
  const { data } = await api.post<SocialPost>('/social/posts/schedule', { postId, scheduledAt });
  return data;
}

export async function publishSocialPost(postId: string): Promise<SocialPost> {
  const { data } = await api.post<SocialPost>(`/social/posts/${postId}/publish`);
  return data;
}

export async function getSocialAnalytics(): Promise<any> {
  const { data } = await api.get<any>('/social/analytics');
  return data;
}

export async function getSocialTrends(): Promise<any[]> {
  const { data } = await api.get<any[]>('/social/trends');
  return data;
}
