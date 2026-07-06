import { Injectable, Logger } from '@nestjs/common';
import { ProductTrackStatus } from '@prisma/client';
import { ProductScorerService, ProductListing } from './product-scorer.service';
import { ShoppingTrackerService } from './shopping-tracker.service';
import { ShoppingPreferenceService } from './shopping-preference.service';

export interface ProductEvaluation {
  product: ProductListing;
  score: number;
  qualifies: boolean;
  reasons: string[];
  status: ProductTrackStatus;
  trackedId: string;
}

export interface ShoppingBatchResult {
  evaluated: number;
  duplicates: number;
  qualified: ProductEvaluation[];
  skipped: ProductEvaluation[];
  best: ProductEvaluation | null;
}

/**
 * Shopping Agent decision layer — the Job Agent recipe applied to commerce:
 *   dedupe → score → record → decide (buy-gate vs watch vs skip).
 *
 * Scraping + the actual checkout run through the existing Amazon/Flipkart
 * plugins on the Playwright engine. Purchases use approve-before-pay: the final
 * checkout step in the plugin plan carries requiresApproval=true unless the
 * price is under the user's autoBuyLimit.
 */
@Injectable()
export class ShoppingAgentService {
  private readonly logger = new Logger(ShoppingAgentService.name);

  constructor(
    private scorer: ProductScorerService,
    private tracker: ShoppingTrackerService,
    private preferences: ShoppingPreferenceService,
  ) {}

  async evaluateBatch(userId: string, products: ProductListing[]): Promise<ShoppingBatchResult> {
    const pref = await this.preferences.get(userId);
    const scoring = this.preferences.toScoringPreferences(pref as any);
    const autoBuyLimit = (pref as any).autoBuyLimit ?? 0;

    const qualified: ProductEvaluation[] = [];
    const skipped: ProductEvaluation[] = [];
    let duplicates = 0;
    let evaluated = 0;
    let best: ProductEvaluation | null = null;

    for (const product of products) {
      if (await this.tracker.alreadySeen(userId, product.site, product.externalProductId)) {
        duplicates++;
        continue;
      }
      evaluated++;

      const match = this.scorer.score(product, scoring);

      // Decide: qualifying + under auto-buy limit → PENDING_APPROVAL (or auto),
      // qualifying but pricey → WATCHING, otherwise SKIPPED.
      let status: ProductTrackStatus;
      if (match.qualifies) {
        const underAutoBuy =
          autoBuyLimit > 0 && typeof product.price === 'number' && product.price <= autoBuyLimit;
        status = underAutoBuy ? 'PENDING_APPROVAL' : 'WATCHING';
      } else {
        status = 'SKIPPED';
      }

      const row = await this.tracker.record(userId, product, match, status);
      const evaluation: ProductEvaluation = {
        product,
        score: match.score,
        qualifies: match.qualifies,
        reasons: match.reasons,
        status,
        trackedId: row.id,
      };

      (match.qualifies ? qualified : skipped).push(evaluation);
      if (match.qualifies && (!best || evaluation.score > best.score)) best = evaluation;
    }

    this.logger.log(
      `[ShoppingAgent] user=${userId} evaluated=${evaluated} dup=${duplicates} qualified=${qualified.length} best=${best?.score ?? '—'}`,
    );

    return { evaluated, duplicates, qualified, skipped, best };
  }
}
