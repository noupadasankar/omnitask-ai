import { Injectable, Logger } from '@nestjs/common';

export interface ProductListing {
  /** Source site, e.g. 'amazon' | 'flipkart'. */
  site: string;
  externalProductId: string;
  title: string;
  brand?: string;
  url?: string;
  price?: number | null;
  currency?: string;
  rating?: number | null;
  reviewCount?: number | null;
  /** Free-form spec/feature tokens scraped from the listing. */
  features?: string[];
  description?: string;
}

export interface ProductScoringPreferences {
  categories: string[];
  mustHaveFeatures: string[];
  avoidKeywords: string[];
  preferredBrands: string[];
  maxPrice?: number | null;
  minRating: number;
  minScore: number;
}

export interface ProductMatchResult {
  score: number;
  qualifies: boolean;
  reasons: string[];
  breakdown: Record<string, number>;
}

/**
 * Rule-based product scorer for the Shopping Agent — the same deterministic,
 * explainable approach proven on the Job Agent, retargeted to commerce signals.
 *
 *   Price within budget   +30  (best value scaled by headroom under maxPrice)
 *   Rating >= minRating   +25  (scaled above the floor)
 *   Must-have features    +25  (proportional coverage)
 *   Preferred brand       +10
 *   Category match        +10
 *   Avoid keyword         -50  (hard penalty)
 *
 * Qualifies when score >= preferences.minScore (default 60) and no avoid hit,
 * and (if a rating is known) rating >= minRating.
 */
@Injectable()
export class ProductScorerService {
  private readonly logger = new Logger(ProductScorerService.name);

  private readonly WEIGHTS = {
    price: 30,
    rating: 25,
    features: 25,
    brand: 10,
    category: 10,
    avoidPenalty: -50,
  };

  score(product: ProductListing, prefs: ProductScoringPreferences): ProductMatchResult {
    const haystack = this.haystack(product);
    const reasons: string[] = [];
    const breakdown: Record<string, number> = {};
    let score = 0;

    // ── Avoid keywords — single hit applies the hard penalty. ──
    const avoidHit = this.firstMatch(haystack, prefs.avoidKeywords);
    if (avoidHit) {
      breakdown.avoid = this.WEIGHTS.avoidPenalty;
      score += this.WEIGHTS.avoidPenalty;
      reasons.push(`Avoid keyword present: "${avoidHit}" (${this.WEIGHTS.avoidPenalty})`);
    }

    // ── Price within budget — more headroom under maxPrice = higher value. ──
    if (prefs.maxPrice && typeof product.price === 'number') {
      if (product.price > prefs.maxPrice) {
        breakdown.price = -999;
        reasons.push(`Price ${product.price} over budget ${prefs.maxPrice} — disqualified`);
        return { score, qualifies: false, reasons, breakdown };
      }
      const headroom = (prefs.maxPrice - product.price) / prefs.maxPrice; // 0..1
      const pts = Math.round((0.4 + 0.6 * headroom) * this.WEIGHTS.price); // always reward in-budget
      breakdown.price = pts;
      score += pts;
      reasons.push(`Within budget (${product.price} ≤ ${prefs.maxPrice}) (+${pts})`);
    } else if (typeof product.price === 'number') {
      breakdown.price = Math.round(this.WEIGHTS.price * 0.4);
      score += breakdown.price;
      reasons.push(`Price known, no budget set (+${breakdown.price})`);
    }

    // ── Rating floor (scaled above the floor towards 5.0). ──
    if (typeof product.rating === 'number') {
      if (product.rating < prefs.minRating) {
        breakdown.rating = -999;
        reasons.push(`Rating ${product.rating} below floor ${prefs.minRating} — disqualified`);
        return { score, qualifies: false, reasons, breakdown };
      }
      const span = Math.max(0.0001, 5 - prefs.minRating);
      const pts = Math.round(((product.rating - prefs.minRating) / span) * this.WEIGHTS.rating);
      breakdown.rating = pts;
      score += pts;
      reasons.push(`Rating ${product.rating} ≥ ${prefs.minRating} (+${pts})`);
    }

    // ── Must-have features (proportional coverage). ──
    if (prefs.mustHaveFeatures.length) {
      const matched = prefs.mustHaveFeatures.filter((f) => this.contains(haystack, f));
      const pts = Math.round((matched.length / prefs.mustHaveFeatures.length) * this.WEIGHTS.features);
      if (pts > 0) {
        breakdown.features = pts;
        score += pts;
        reasons.push(`Features ${matched.length}/${prefs.mustHaveFeatures.length} (+${pts})`);
      }
    }

    // ── Preferred brand. ──
    const brandHit = this.firstMatch(`${product.brand || ''} ${product.title}`, prefs.preferredBrands);
    if (brandHit) {
      breakdown.brand = this.WEIGHTS.brand;
      score += this.WEIGHTS.brand;
      reasons.push(`Preferred brand: "${brandHit}" (+${this.WEIGHTS.brand})`);
    }

    // ── Category match. ──
    const catHit = this.firstMatch(haystack, prefs.categories);
    if (catHit) {
      breakdown.category = this.WEIGHTS.category;
      score += this.WEIGHTS.category;
      reasons.push(`Category match: "${catHit}" (+${this.WEIGHTS.category})`);
    }

    const qualifies =
      score >= prefs.minScore &&
      !avoidHit &&
      (typeof product.rating !== 'number' || product.rating >= prefs.minRating);

    return { score, qualifies, reasons, breakdown };
  }

  private haystack(p: ProductListing): string {
    return [p.title, p.brand, p.description, ...(p.features || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  private contains(haystack: string, keyword: string): boolean {
    const k = keyword.trim().toLowerCase();
    return k.length > 0 && haystack.includes(k);
  }

  private firstMatch(text: string, keywords: string[]): string | null {
    const t = (text || '').toLowerCase();
    for (const raw of keywords) {
      const k = raw.trim().toLowerCase();
      if (k && t.includes(k)) return raw;
    }
    return null;
  }
}
