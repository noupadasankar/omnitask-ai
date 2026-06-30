import { Controller, Post, Get, Body, Query, Request, UseGuards } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  submit(@Request() req: any, @Body() dto: any) {
    return this.feedbackService.submit(req.user.id, dto);
  }

  @Get()
  list(@Request() req: any, @Query('limit') limit?: string) {
    return this.feedbackService.list(req.user.id, limit ? parseInt(limit, 10) : 20);
  }

  @Get('stats')
  stats(@Request() req: any) {
    return this.feedbackService.getStats(req.user.id);
  }
}
