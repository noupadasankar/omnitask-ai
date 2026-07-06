import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MediaSearchQuery {
  query: string;
  type?: 'track' | 'album' | 'artist' | 'playlist' | 'video';
  limit?: number;
}

export interface MediaTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  url: string;
  thumbnail?: string;
  provider: 'youtube' | 'spotify' | 'soundcloud';
}

export interface MediaPlaybackResult {
  success: boolean;
  track?: MediaTrack;
  action: string;
  url?: string;
  message: string;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(private prisma: PrismaService) {}

  async search(query: MediaSearchQuery): Promise<MediaTrack[]> {
    this.logger.log(`Searching media: "${query.query}" (type: ${query.type || 'any'})`);

    await new Promise((r) => setTimeout(r, 500));

    const results: MediaTrack[] = [];

    if (!query.type || query.type === 'track' || query.type === 'video') {
      results.push(
        {
          id: `yt_${Date.now()}_1`,
          title: `${query.query} - Official Music Video`,
          artist: 'Various Artists',
          duration: 240,
          url: `https://music.youtube.com/search?q=${encodeURIComponent(query.query)}`,
          thumbnail: `https://i.ytimg.com/vi/default.jpg`,
          provider: 'youtube',
        },
        {
          id: `yt_${Date.now()}_2`,
          title: `${query.query} (Lyrics)`,
          artist: 'Featured Artist',
          duration: 210,
          url: `https://music.youtube.com/search?q=${encodeURIComponent(query.query + ' lyrics')}`,
          thumbnail: `https://i.ytimg.com/vi/default.jpg`,
          provider: 'youtube',
        },
      );
    }

    if (!query.type || query.type === 'track' || query.type === 'album') {
      results.push(
        {
          id: `sp_${Date.now()}_1`,
          title: query.query,
          artist: 'Popular Artist',
          album: 'Greatest Hits',
          duration: 200,
          url: `https://open.spotify.com/search/${encodeURIComponent(query.query)}`,
          thumbnail: 'https://i.scdn.co/image/default',
          provider: 'spotify',
        },
      );
    }

    return results.slice(0, query.limit || 10);
  }

  async play(userId: string, trackId: string, provider?: string): Promise<MediaPlaybackResult> {
    this.logger.log(`Playing track ${trackId} for user ${userId}`);

    const session = await this.prisma.mediaSession.create({
      data: {
        userId,
        provider: provider || 'youtube',
        action: 'play',
        trackId,
        status: 'completed',
      },
    });

    const url = provider === 'spotify'
      ? `https://open.spotify.com/track/${trackId}`
      : `https://music.youtube.com/watch?v=${trackId}`;

    return {
      success: true,
      action: 'play',
      url,
      message: `Playing track on ${provider || 'YouTube Music'}`,
    };
  }

  async playByQuery(userId: string, query: string, provider?: string): Promise<MediaPlaybackResult> {
    const results = await this.search({ query, limit: 1, type: 'track' });
    if (results.length === 0) {
      return { success: false, action: 'play', message: `No results found for "${query}"` };
    }

    const track = results[0];
    return this.play(userId, track.id, provider || track.provider);
  }

  async queue(userId: string, trackId: string, provider?: string): Promise<MediaPlaybackResult> {
    await this.prisma.mediaSession.create({
      data: { userId, provider: provider || 'youtube', action: 'queue', trackId, status: 'completed' },
    });

    return {
      success: true,
      action: 'queue',
      message: `Track queued on ${provider || 'YouTube Music'}`,
    };
  }

  async pause(userId: string, provider?: string): Promise<MediaPlaybackResult> {
    await this.prisma.mediaSession.create({
      data: { userId, provider: provider || 'youtube', action: 'pause', status: 'completed' },
    });

    return { success: true, action: 'pause', message: 'Playback paused' };
  }

  async getHistory(userId: string, limit = 20): Promise<any[]> {
    return this.prisma.mediaSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
