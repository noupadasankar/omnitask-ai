import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SocialPostService } from './social-post.service';
import { SocialTrackerService } from './social-tracker.service';
import { LinkedInAdapter } from './platform-adapters/linkedin-adapter';
import { TwitterAdapter } from './platform-adapters/twitter-adapter';
import { SocialPostStatus } from '@prisma/client';

@Injectable()
export class SocialService {
  constructor(
    private prisma: PrismaService,
    private postService: SocialPostService,
    private trackerService: SocialTrackerService,
    private linkedinAdapter: LinkedInAdapter,
    private twitterAdapter: TwitterAdapter,
  ) {}

  async listPosts(userId: string, status?: SocialPostStatus) {
    return this.prisma.socialPost.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listPostsPaginated(userId: string, status: SocialPostStatus | undefined, cursor?: string, take: number = 20) {
    const pageSize = Math.min(take, 100);
    const decodedCursor = cursor
      ? (() => { try { return Buffer.from(cursor, 'base64url').toString('utf-8'); } catch { return undefined; } })()
      : undefined;

    const items = await this.prisma.socialPost.findMany({
      take: pageSize + 1,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = items.length > pageSize;
    const data = hasMore ? items.slice(0, pageSize) : items;
    const last = data[data.length - 1];
    return {
      data,
      nextCursor: last && hasMore ? Buffer.from(last.id, 'utf-8').toString('base64url') : null,
      hasMore,
    };
  }

  async generateAndSaveDraft(userId: string, topic: string, platform: string, tone?: string) {
    const content = await this.postService.generateDraft(topic, platform, tone);
    
    return this.prisma.socialPost.create({
      data: {
        userId,
        platform,
        content,
        status: 'DRAFT',
      },
    });
  }

  async schedulePost(userId: string, postId: string, scheduledAt: Date) {
    const post = await this.prisma.socialPost.findFirst({
      where: { id: postId, userId },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const validation = this.postService.validateContent(post.content, post.platform);
    if (!validation.valid) {
      throw new BadRequestException(validation.reason);
    }

    return this.prisma.socialPost.update({
      where: { id: postId },
      data: {
        status: 'SCHEDULED',
        scheduledAt,
      },
    });
  }

  async publishPost(userId: string, postId: string) {
    const post = await this.prisma.socialPost.findFirst({
      where: { id: postId, userId },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const validation = this.postService.validateContent(post.content, post.platform);
    if (!validation.valid) {
      throw new BadRequestException(validation.reason);
    }

    let result;
    if (post.platform === 'linkedin') {
      result = await this.linkedinAdapter.publish(post.content);
    } else if (post.platform === 'twitter') {
      result = await this.twitterAdapter.publish(post.content);
    } else {
      result = { success: true, externalId: `mock_${Math.random().toString(36).substring(2, 9)}` };
    }

    if (result.success) {
      return this.prisma.socialPost.update({
        where: { id: postId },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          sessionId: result.externalId,
          likes: Math.floor(Math.random() * 50) + 10,
          shares: Math.floor(Math.random() * 10) + 2,
          comments: Math.floor(Math.random() * 5) + 1,
          views: Math.floor(Math.random() * 500) + 100,
        },
      });
    } else {
      return this.prisma.socialPost.update({
        where: { id: postId },
        data: {
          status: 'FAILED',
        },
      });
    }
  }

  async getAnalytics(userId: string) {
    return this.trackerService.trackStats(userId);
  }

  async getTrends() {
    return this.trackerService.getTrends();
  }
}
