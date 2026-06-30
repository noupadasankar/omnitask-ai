import { Module } from '@nestjs/common';
import { ShoppingController } from './shopping.controller';
import { ShoppingAgentService } from './shopping-agent.service';
import { ProductScorerService } from './product-scorer.service';
import { ShoppingTrackerService } from './shopping-tracker.service';
import { ShoppingPreferenceService } from './shopping-preference.service';

/**
 * Autonomous Shopping Agent — decision/intelligence layer.
 *
 * Scraping and checkout run through the existing Amazon/Flipkart plugins on the
 * Playwright engine; this module adds rule-based product scoring, price tracking
 * with drop alerts, watchlists, and a purchase approval gate. Mirrors JobModule.
 */
@Module({
  controllers: [ShoppingController],
  providers: [
    ShoppingAgentService,
    ProductScorerService,
    ShoppingTrackerService,
    ShoppingPreferenceService,
  ],
  exports: [
    ShoppingAgentService,
    ProductScorerService,
    ShoppingTrackerService,
    ShoppingPreferenceService,
  ],
})
export class ShoppingModule {}
