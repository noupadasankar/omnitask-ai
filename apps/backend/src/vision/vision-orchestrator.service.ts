import { Injectable, Logger } from '@nestjs/common';
import { DomAnalyzerService } from './dom-analyzer.service';
import { LayoutUnderstandingService } from './layout-understanding.service';
import { SemanticElementMatcherService } from './semantic-element-matcher.service';
import {
  PageModel,
  RawDomNode,
  SemanticMatchResult,
  VisionAnalysisResult,
} from './vision.types';

@Injectable()
export class VisionOrchestratorService {
  private readonly logger = new Logger(VisionOrchestratorService.name);

  constructor(
    private domAnalyzer: DomAnalyzerService,
    private layoutService: LayoutUnderstandingService,
    private semanticMatcher: SemanticElementMatcherService,
  ) {}

  /**
   * Run full multi-layer vision analysis.
   * Layer 1 (DOM) + Layer 3 (layout) are always fast.
   * Layer 2 vision fallback only when explicitly requested via findEquivalent.
   */
  analyzePage(
    url: string,
    title: string,
    rawNodes: RawDomNode[],
    viewport?: { width: number; height: number },
  ): VisionAnalysisResult {
    const pageModel = this.domAnalyzer.buildPageModel(url, title, rawNodes);
    const layout = this.layoutService.analyzeFromDom(pageModel, viewport);

    this.logger.log(
      `[Vision] Analyzed ${url} — ${pageModel.buttons.length} buttons, state=${layout.pageState}`,
    );

    return {
      pageModel,
      layout,
      analyzedAt: Date.now(),
      usedVisionFallback: false,
    };
  }

  async findEquivalentElement(
    analysis: VisionAnalysisResult,
    intentText: string,
    failedSelector?: string,
    screenshotBase64?: string,
  ): Promise<SemanticMatchResult> {
    return this.semanticMatcher.findEquivalentElement(
      analysis.pageModel,
      intentText,
      failedSelector,
      screenshotBase64,
    );
  }

  async rememberSuccessfulMatch(
    analysis: VisionAnalysisResult,
    intentText: string,
    match: SemanticMatchResult,
  ): Promise<void> {
    await this.semanticMatcher.rememberMatch(analysis.pageModel, intentText, match);
  }

  getSiteKey(url: string): string {
    return this.domAnalyzer.extractSiteKey(url);
  }
}
