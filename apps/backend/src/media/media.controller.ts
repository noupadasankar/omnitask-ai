import { Controller, Post, Get, Body, Query, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MediaService, MediaSearchQuery } from './media.service';
import { PlayMediaSchema, QueueMediaSchema, PauseMediaSchema } from './dto/media.dto';
import type { PlayMediaDto, QueueMediaDto, PauseMediaDto } from './dto/media.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private media: MediaService) {}

  @Get('search')
  async search(@Query() query: MediaSearchQuery) {
    return this.media.search(query);
  }

  @Post('play')
  async play(
    @Request() req: any,
    @Body(new ZodValidationPipe(PlayMediaSchema)) body: PlayMediaDto,
  ) {
    if (body.query) {
      return this.media.playByQuery(req.user.id, body.query, body.provider);
    }
    if (body.trackId) {
      return this.media.play(req.user.id, body.trackId, body.provider);
    }
    return { success: false, message: 'Provide query or trackId' };
  }

  @Post('queue')
  async queue(
    @Request() req: any,
    @Body(new ZodValidationPipe(QueueMediaSchema)) body: QueueMediaDto,
  ) {
    return this.media.queue(req.user.id, body.trackId, body.provider);
  }

  @Post('pause')
  async pause(
    @Request() req: any,
    @Body(new ZodValidationPipe(PauseMediaSchema)) body: PauseMediaDto,
  ) {
    return this.media.pause(req.user.id, body.provider);
  }

  @Get('history')
  async history(@Request() req: any, @Query('limit') limit?: string) {
    return this.media.getHistory(req.user.id, limit ? parseInt(limit, 10) : undefined);
  }
}
