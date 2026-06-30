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
    @UploadedFile() file: any,
    @Body(new ZodValidationPipe(SttSchema)) body: SttDto,
  ) {
    if (!file) return { success: false, message: 'No audio file provided' };
    return this.voice.speechToText(file.buffer, body.language, body.sessionId);
  }

  @Post('tts')
  async textToSpeech(
    @Body(new ZodValidationPipe(TtsSchema)) body: TtsDto,
  ) {
    return this.voice.textToSpeech(body.text, body.voice, body.speed, body.sessionId);
  }

  @Post('command')
  @UseInterceptors(FileInterceptor('audio'))
  async voiceCommand(
    @UploadedFile() file: any,
    @Body(new ZodValidationPipe(VoiceCommandSchema)) body: VoiceCommandDto,
  ) {
    if (!file) return { success: false, message: 'No audio file provided' };
    return this.voice.processVoiceCommand(file.buffer, body.language, body.wakeWordDetected === 'true');
  }

  @Get('history')
  async history(@Query('limit') limit?: string) {
    return this.voice.getHistory('system', limit ? parseInt(limit, 10) : undefined);
  }
}
