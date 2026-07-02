import { Controller, Post, Get, Body, Query, UseGuards, Request, UploadedFile, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { VoiceService } from './voice.service';
import { SttSchema, TtsSchema, VoiceCommandSchema } from './dto/voice.dto';
import type { SttDto, TtsDto, VoiceCommandDto } from './dto/voice.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('voice')
@UseGuards(JwtAuthGuard)
export class VoiceController {
  constructor(private voice: VoiceService) {}

  @Post('stt')
  @UseInterceptors(FileInterceptor('audio'))
  async speechToText(
    @Request() req: any,
    @UploadedFile() file: any,
    @Body(new ZodValidationPipe(SttSchema)) body: SttDto,
  ) {
    if (!file) return { success: false, message: 'No audio file provided' };
    return this.voice.speechToText(req.user.id, file.buffer, body.language, body.sessionId);
  }

  @Post('tts')
  async textToSpeech(
    @Request() req: any,
    @Body(new ZodValidationPipe(TtsSchema)) body: TtsDto,
  ) {
    return this.voice.textToSpeech(req.user.id, body.text, body.voice, body.speed, body.sessionId);
  }

  @Post('command')
  @UseInterceptors(FileInterceptor('audio'))
  async voiceCommand(
    @Request() req: any,
    @UploadedFile() file: any,
    @Body(new ZodValidationPipe(VoiceCommandSchema)) body: VoiceCommandDto,
  ) {
    if (!file) return { success: false, message: 'No audio file provided' };
    return this.voice.processVoiceCommand(req.user.id, file.buffer, body.language, body.wakeWordDetected === 'true');
  }

  @Get('history')
  async history(@Request() req: any, @Query('limit') limit?: string) {
    return this.voice.getHistory(req.user.id, limit ? parseInt(limit, 10) : undefined);
  }
}
