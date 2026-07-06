import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SocialTrackerService {
  constructor(private prisma: PrismaService) {}

  async trackStats(userId: string) {
    const posts = await this.prisma.socialPost.findMany({
      where: { userId },
    });

    const totalLikes = posts.reduce((sum, p) => sum + p.likes, 0);
    const totalShares = posts.reduce((sum, p) => sum + p.shares, 0);
    const totalComments = posts.reduce((sum, p) => sum + p.comments, 0);
    const totalViews = posts.reduce((sum, p) => sum + p.views, 0);

    const publishedCount = posts.filter((p) => p.status === 'PUBLISHED').length;
    const scheduledCount = posts.filter((p) => p.status === 'SCHEDULED').length;

    // Follower metrics stub
    const followers = {
      linkedin: 1250,
      twitter: 850,
    };

    return {
      totalPosts: posts.length,
      publishedCount,
      scheduledCount,
      engagement: {
        likes: totalLikes,
        shares: totalShares,
        comments: totalComments,
        views: totalViews,
        rate: totalViews > 0 ? ((totalLikes + totalShares + totalComments) / totalViews) * 100 : 0,
      },
      followers,
      growthRate: 12.5,
    };
  }

  async getTrends() {
    return [
      { topic: '#AIagents', volume: '125K posts', domain: 'Technology' },
      { topic: '#AutonomousSystems', volume: '84K posts', domain: 'Technology' },
      { topic: '#TypeScript', volume: '62K posts', domain: 'Development' },
      { topic: '#WebDev2026', volume: '45K posts', domain: 'Development' },
    ];
  }
}
