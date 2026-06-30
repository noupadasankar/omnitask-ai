import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { CreateWebhookSchema, UpdateWebhookSchema } from './webhook.dto';
import type { CreateWebhookDto, UpdateWebhookDto } from './webhook.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('webhooks')
@UseGuards(JwtAuthGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Request() req: any,
    @Body(new ZodValidationPipe(CreateWebhookSchema)) dto: CreateWebhookDto,
  ) {
    return this.webhookService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.webhookService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.webhookService.findOne(req.user.id, id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateWebhookSchema)) dto: UpdateWebhookDto,
  ) {
    return this.webhookService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Request() req: any, @Param('id') id: string) {
    await this.webhookService.remove(req.user.id, id);
  }
}
