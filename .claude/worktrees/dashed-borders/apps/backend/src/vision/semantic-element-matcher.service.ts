import { Injectable, Logger } from '@nestjs/common';
import {
  ElementInfo,
  PageModel,
  SemanticMatchResult,
} from './vision.types';
import { SiteMemoryService } from './site-memory.service';
import { SemanticMatcherService } from './semantic-matcher.service';
import { DomAnalyzerService } from './dom-analyzer.service';

@Injectable()
export class SemanticElementMatcherService {
  private readonly logger = new Logger(SemanticElementMatcherService.name);

  constructor(
    private siteMemory: SiteMemoryService,
    private visionFallback: SemanticMatcherService,
    private domAnalyzer: DomAnalyzerService,
  ) {}

  /**
   * Layer 2 — Find equivalent element for failed/missing selector.
   * Fast path: site memory → DOM text match → vision fallback.
   */
  async findEquivalentElement(
    pageModel: PageModel,
    intentText: string,
    failedSelector?: string,
    screenshotBase64?: string,
  ): Promise<SemanticMatchResult> {
    const siteId = this.domAnalyzer.extractSiteKey(pageModel.url);
    const intentKey = this.buildIntentKey(intentText, failedSelector);

    // ── Layer 4: Site knowledge cache ─────────────────────────────────────
    const cached = await this.siteMemory.lookupMapping(siteId, intentKey);
    if (cached) {
      const element = this.findBySelector(pageModel, cached.selector);
      if (element) {
        return {
          element,
          selectorMatched: cached.selector,
          matchedText: cached.label,
          confidence: Math.min(0.98, cached.confidence + 0.05),
          reasoning: `Site memory: "${cached.label}" previously mapped for "${intentKey}"`,
          source: 'site_memory',
          actionRequired: 'click',
        };
      }
    }

    // ── Layer 2a: Exact / partial text match on buttons & links ───────────
    const candidates = [...pageModel.buttons, ...pageModel.links, ...pageModel.inputs];
    const textMatch = this.matchByText(candidates, intentText, failedSelector);
    if (textMatch && textMatch.confidence >= 0.75) {
      return textMatch;
    }

    // ── Layer 2b: Semantic token overlap ───────────────────────────────────
    const semanticMatch = this.matchBySemanticTokens(candidates, intentText);
    if (semanticMatch && semanticMatch.confidence >= 0.65) {
      return semanticMatch;
    }

    // Return best DOM match even if below threshold for healer to decide
    if (textMatch && textMatch.confidence >= 0.5) {
      return textMatch;
    }
    if (semanticMatch && semanticMatch.confidence >= 0.5) {
      return semanticMatch;
    }

    // ── Vision fallback (expensive) ────────────────────────────────────────
    if (screenshotBase64 && failedSelector) {
      this.logger.log(`[SemanticMatcher] DOM match insufficient — vision fallback for "${failedSelector}"`);
      const vision = await this.visionFallback.matchAlternative(
        screenshotBase64,
        failedSelector,
        intentText,
      );
      if (vision.confidence > 0.55) {
        const element = this.findBySelector(pageModel, vision.selectorMatched);
        return {
          element: element || null,
          selectorMatched: vision.selectorMatched,
          matchedText: element?.text || vision.selectorMatched,
          confidence: vision.confidence,
          reasoning: vision.reasoning,
          source: 'vision_fallback',
          actionRequired: vision.actionRequired === 'close_popup' ? 'close_popup' : 'click',
        };
      }
    }

    return {
      element: null,
      selectorMatched: failedSelector || '',
      matchedText: '',
      confidence: 0,
      reasoning: 'No equivalent element found via DOM or vision',
      source: 'dom_semantic',
      actionRequired: 'none',
    };
  }

  /** Persist successful match for future runs */
  async rememberMatch(
    pageModel: PageModel,
    intentText: string,
    match: SemanticMatchResult,
  ): Promise<void> {
    if (!match.element || match.confidence < 0.7) return;
    const siteId = this.domAnalyzer.extractSiteKey(pageModel.url);
    const intentKey = this.buildIntentKey(intentText, match.selectorMatched);
    await this.siteMemory.saveMapping(
      siteId,
      intentKey,
      match.matchedText || match.element.text,
      match.selectorMatched,
      match.confidence,
    );
  }

  private buildIntentKey(intentText: string, selector?: string): string {
    const fromText = intentText.replace(/^\[[^\]]+\]\s*/, '').trim();
    const fromSelector = selector?.replace(/[#.\[\]="']/g, ' ').trim() || '';
    return fromText || fromSelector || 'unknown';
  }

  private matchByText(
    candidates: ElementInfo[],
    intentText: string,
    failedSelector?: string,
  ): SemanticMatchResult | null {
    const needles = this.extractSearchTerms(intentText, failedSelector);
    let best: { el: ElementInfo; score: number; reason: string } | null = null;

    for (const el of candidates) {
      const haystack = `${el.text} ${el.ariaLabel}`.toLowerCase();
      if (!haystack.trim()) continue;

      for (const needle of needles) {
        if (haystack === needle) {
          const score = 0.95;
          if (!best || score > best.score) {
            best = { el, score, reason: `Exact text match: "${el.text}"` };
          }
        } else if (haystack.includes(needle) || needle.includes(haystack)) {
          const score = 0.82;
          if (!best || score > best.score) {
            best = { el, score, reason: `Partial text match: "${el.text}" ~ "${needle}"` };
          }
        }
      }
    }

    if (!best) return null;
    return {
      element: best.el,
      selectorMatched: best.el.selector,
      matchedText: best.el.text || best.el.ariaLabel,
      confidence: best.score,
      reasoning: best.reason,
      source: 'dom_text',
      actionRequired: 'click',
    };
  }

  private matchBySemanticTokens(
    candidates: ElementInfo[],
    intentText: string,
  ): SemanticMatchResult | null {
    const intentTokens = this.tokenize(intentText);
    if (intentTokens.length === 0) return null;

    let best: { el: ElementInfo; score: number } | null = null;

    for (const el of candidates) {
      const elTokens = this.tokenize(`${el.text} ${el.ariaLabel}`);
      const overlap = intentTokens.filter((t) => elTokens.includes(t)).length;
      const score = overlap / Math.max(intentTokens.length, 1);
      if (score >= 0.4 && (!best || score > best.score)) {
        best = { el, score: Math.min(0.88, 0.5 + score * 0.4) };
      }
    }

    if (!best) return null;
    return {
      element: best.el,
      selectorMatched: best.el.selector,
      matchedText: best.el.text || best.el.ariaLabel,
      confidence: best.score,
      reasoning: `Semantic token overlap with "${best.el.text}"`,
      source: 'dom_semantic',
      actionRequired: 'click',
    };
  }

  private extractSearchTerms(intentText: string, failedSelector?: string): string[] {
    const terms = new Set<string>();
    const cleaned = intentText.replace(/^\[[^\]]+\]\s*/, '');

    // Quoted strings in description
    const quoted = cleaned.match(/"([^"]+)"/g);
    if (quoted) {
      quoted.forEach((q) => terms.add(q.replace(/"/g, '').toLowerCase()));
    }

    // Action verbs stripped
    const withoutVerbs = cleaned
      .replace(/\b(click|type|navigate|focus|submit|select|press|enter|fill)\b/gi, '')
      .trim();
    if (withoutVerbs.length > 2) terms.add(withoutVerbs.toLowerCase());

    // Common button labels from description
    const buttonWords = ['apply now', 'quick apply', 'easy apply', 'submit', 'search', 'login', 'sign in', 'close', 'accept', 'continue'];
    for (const bw of buttonWords) {
      if (cleaned.toLowerCase().includes(bw)) terms.add(bw);
    }

    if (failedSelector) {
      const selText = failedSelector.replace(/[#.\[\]="']/g, ' ').trim();
      if (selText.length > 2) terms.add(selText.toLowerCase());
    }

    return [...terms].filter((t) => t.length > 1);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !['the', 'and', 'for', 'with', 'button', 'field'].includes(t));
  }

  private findBySelector(pageModel: PageModel, selector: string): ElementInfo | undefined {
    return pageModel.allElements.find(
      (el) => el.selector === selector || el.id === selector,
    );
  }
}
