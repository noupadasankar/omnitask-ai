import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailService } from './email.service';
import { EmailConfigSchema, SendEmailInputSchema, DraftEmailSchema } from './dto/email.dto';
import type { EmailConfigDto, SendEmailInputDto, DraftEmailDto } from './dto/email.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('email')
@UseGuards(JwtAuthGuard)
export class EmailController {
  constructor(private email: EmailService) {}

  @Post('accounts')
  async addAccount(
    @Request() req: any,
    @Body(new ZodValidationPipe(EmailConfigSchema)) config: EmailConfigDto,
  ) {
    return this.email.addAccount(req.user.id, config);
  }

  @Get('accounts')
  async listAccounts(@Request() req: any) {
    return this.email.listAccounts(req.user.id);
  }

  @Delete('accounts/:id')
  async removeAccount(@Request() req: any, @Param('id') id: string) {
    await this.email.removeAccount(req.user.id, id);
    return { success: true };
  }

  @Post('accounts/:id/send')
  async sendEmail(
    @Request() req: any,
    @Param('id') accountId: string,
    @Body(new ZodValidationPipe(SendEmailInputSchema)) input: SendEmailInputDto,
  ) {
    return this.email.sendEmail(req.user.id, accountId, input);
  }

  @Get('accounts/:id/messages')
  async listMessages(
    @Request() req: any,
    @Param('id') accountId: string,
    @Query('folder') folder?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.email.listMessages(req.user.id, accountId, folder, search, cursor, take ? parseInt(take, 10) : undefined);
  }

  @Post('accounts/:id/draft')
  async composeDraft(
    @Request() req: any,
    @Param('id') accountId: string,
    @Body(new ZodValidationPipe(DraftEmailSchema)) input: DraftEmailDto,
  ) {
    return this.email.composeDraft(req.user.id, accountId, input.to, input.subject, input.body);
  }

  @Post('messages/:id/read')
  async markAsRead(@Request() req: any, @Param('id') messageId: string) {
    await this.email.markAsRead(req.user.id, messageId);
    return { success: true };
  }

  @Delete('messages/:id')
  async deleteMessage(@Request() req: any, @Param('id') messageId: string) {
    await this.email.deleteMessage(req.user.id, messageId);
    return { success: true };
  }

  @Post('messages/:id/categorize')
  async categorize(@Param('id') messageId: string) {
    const category = await this.email.categorizeEmail(messageId);
    return { category };
  }

  @Post('messages/:id/draft-reply')
  async draftReply(
    @Param('id') messageId: string,
    @Body('tone') tone?: 'professional' | 'casual' | 'brief',
  ) {
    return this.email.draftReply(messageId, tone);
  }

  @Post('messages/:id/unsubscribe')
  async unsubscribe(@Param('id') messageId: string) {
    return this.email.unsubscribe(messageId);
  }

  @Get('optimal-time')
  async optimalSendTime(@Request() req: any) {
    return this.email.predictOptimalSendTime(req.user.id);
  }
}
