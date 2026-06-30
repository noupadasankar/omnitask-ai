import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ProductTrackStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ShoppingAgentService } from './shopping-agent.service';
import { ShoppingTrackerService } from './shopping-tracker.service';
import {
  ShoppingPreferenceService,
} from './shopping-preference.service';
import { ShoppingPreferenceSchema, EvaluateProductsSchema, WatchProductSchema, ObservePriceSchema } from './dto/shopping.dto';
import type { ShoppingPreferenceDto, EvaluateProductsDto, WatchProductDto, ObservePriceDto } from './dto/shopping.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('shopping')
@UseGuards(JwtAuthGuard)
export class ShoppingController {
  constructor(
    private shoppingAgent: ShoppingAgentService,
    private tracker: ShoppingTrackerService,
    private preferences: ShoppingPreferenceService,
  ) {}

  @Get('preferences')
  async getPreferences(@Request() req: any) {
    return this.preferences.get(req.user.id);
  }

  @Put('preferences')
  async savePreferences(
    @Request() req: any,
    @Body(new ZodValidationPipe(ShoppingPreferenceSchema)) body: ShoppingPreferenceDto,
  ) {
    return this.preferences.save(req.user.id, body);
  }

  @Post('evaluate')
  async evaluate(
    @Request() req: any,
    @Body(new ZodValidationPipe(EvaluateProductsSchema)) body: EvaluateProductsDto,
  ) {
    return this.shoppingAgent.evaluateBatch(req.user.id, body.products);
  }

  @Post('watch')
  async watch(
    @Request() req: any,
    @Body(new ZodValidationPipe(WatchProductSchema)) body: WatchProductDto,
  ) {
    return this.tracker.watch(req.user.id, body.product, body.targetPrice);
  }

  @Post('observe-price')
  async observePrice(
    @Body(new ZodValidationPipe(ObservePriceSchema)) body: ObservePriceDto,
  ) {
    return this.tracker.observePrice(body.trackedId, body.price, body.dropPct ?? 10);
  }

  @Get('products')
  async products(@Request() req: any, @Query('status') status?: ProductTrackStatus) {
    return this.tracker.list(req.user.id, status);
  }

  @Get('stats')
  async stats(@Request() req: any) {
    return this.tracker.stats(req.user.id);
  }
}
