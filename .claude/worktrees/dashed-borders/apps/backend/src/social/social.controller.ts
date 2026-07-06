import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SocialService } from './social.service';
import { SocialPostStatus } from '@prisma/client';

@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private socialService: SocialService) {}

  @Get('posts')
  async listPosts(
    @Request() req: any,
    @Query('status') status?: SocialPostStatus,
  ) {
    return this.socialService.listPosts(req.user.id, status);
  }

  @Post('posts/generate')
  async generate(
    @Request() req: any,
    @Body() body: { topic: string; platform: string; tone?: string },
  ) {
    return this.socialService.generateAndSaveDraft(
      req.user.id,
      body.topic,
      body.platform,
      body.tone,
    );
  }

  @Post('posts/schedule')
  async schedule(
    @Request() req: any,
    @Body() body: { postId: string; scheduledAt: string },
  ) {
    return this.socialService.schedulePost(
      req.user.id,
      body.postId,
      new Date(body.scheduledAt),
    );
  }

  @Post('posts/:id/publish')
  async publish(@Request() req: any, @Param('id') postId: string) {
    return this.socialService.publishPost(req.user.id, postId);
  }

  @Get('analytics')
  async getAnalytics(@Request() req: any) {
    return this.socialService.getAnalytics(req.user.id);
  }

  @Get('trends')
  async getTrends() {
    return this.socialService.getTrends();
  }
}
