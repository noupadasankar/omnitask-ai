import { Injectable, Logger } from '@nestjs/common';
import { VisionOrchestratorService } from '../../../vision/vision-orchestrator.service';
import { HealingContext, RecoveryPlan } from './healing.types';

@Injectable()
export class SelectorHealerService {
  private readonly logger = new Logger(SelectorHealerService.name);

  constructor(private vision: VisionOrchestratorService) {}

  async attempt(context: HealingContext): Promise<RecoveryPlan> {
    if (!context.rawDom || !context.url) {
      return this.noHeal('No DOM snapshot available for selector recovery');
    }

    const analysis = this.vision.analyzePage(
      context.url,
      context.title || '',
      context.rawDom,
      context.viewport,
    );

    const match = await this.vision.findEquivalentElement(
      analysis,
      context.description,
      context.target,
      context.screenshot,
    );

    if (match.confidence >= 0.6 && match.selectorMatched && match.selectorMatched !== context.target) {
      this.logger.log(
        `[SelectorHealer] "${context.target}" → "${match.selectorMatched}" (${match.confidence}, ${match.source})`,
      );

      await this.vision.rememberSuccessfulMatch(analysis, context.description, match);

      return {
        type: 'selector',
        healed: true,
        alternativeSelector: match.selectorMatched,
        recoverySteps: [],
        explanation: `${match.reasoning} [${match.source}]`,
        confidence: match.confidence,
        resumeAfterRecovery: true,
      };
    }

    // Popup dismiss via close button in modals
    if (analysis.layout.modals.length > 0 && match.actionRequired === 'close_popup') {
      const closeEl = analysis.layout.modals.find(
        (m) =>
          /close|dismiss|accept|got it|ok/i.test(`${m.text} ${m.ariaLabel}`),
      );
      if (closeEl) {
        return {
          type: 'popup_dismiss',
          healed: true,
          recoverySteps: [
            {
              action: 'click',
              target: closeEl.selector,
              description: `Dismiss popup: ${closeEl.text || closeEl.ariaLabel}`,
            },
          ],
          explanation: 'Dismiss blocking popup before retrying original step',
          confidence: 0.85,
          resumeAfterRecovery: true,
        };
      }
    }

    return this.noHeal(
      match.confidence > 0
        ? `Best match "${match.matchedText}" confidence too low (${match.confidence})`
        : 'No semantic alternative found',
    );
  }

  private noHeal(reason: string): RecoveryPlan {
    return {
      type: 'selector',
      healed: false,
      recoverySteps: [],
      explanation: reason,
      confidence: 0,
      resumeAfterRecovery: false,
    };
  }
}
