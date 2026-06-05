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
  ShoppingPreferenceInput,
} from './shopping-preference.service';
import { ProductListing } from './product-scorer.service';

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
  async savePreferences(@Request() req: any, @Body() body: ShoppingPreferenceInput) {
    return this.preferences.save(req.user.id, body);
  }

  /** Dedupe → score → record → decide over a batch of scraped products. */
  @Post('evaluate')
  async evaluate(@Request() req: any, @Body() body: { products: ProductListing[] }) {
    return this.shoppingAgent.evaluateBatch(req.user.id, body.products || []);
  }

  /** Add a product to the price watchlist with an optional target price. */
  @Post('watch')
  async watch(
    @Request() req: any,
    @Body() body: { product: ProductListing; targetPrice?: number },
  ) {
    return this.tracker.watch(req.user.id, body.product, body.targetPrice);
  }

  /** Apply a fresh price observation; returns a drop alert when triggered. */
  @Post('observe-price')
  async observePrice(
    @Body() body: { trackedId: string; price: number; dropPct?: number },
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
