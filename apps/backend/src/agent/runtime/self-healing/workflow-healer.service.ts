import { Injectable, Logger } from '@nestjs/common';
import { VisionOrchestratorService } from '../../../vision/vision-orchestrator.service';
import { HealingContext, RecoveryPlan, RecoveryStep } from './healing.types';

@Injectable()
export class WorkflowHealerService {
  private readonly logger = new Logger(WorkflowHealerService.name);

  constructor(private vision: VisionOrchestratorService) {}

  /**
   * Type 3 — Detect site workflow changes (extra review/submit steps).
   */
  async attempt(context: HealingContext): Promise<RecoveryPlan> {
    if (!context.rawDom || !context.url) {
      return this.noHeal('No DOM for workflow analysis');
    }

    const analysis = this.vision.analyzePage(
      context.url,
      context.title || '',
      context.rawDom,
      context.viewport,
    );

    const insertSteps: RecoveryStep[] = [];
    const desc = context.description.toLowerCase();
    const action = context.action.toLowerCase();

    // Detect review/confirmation page after submit
    if (
      (action === 'click' && /submit|apply|upload|continue/i.test(desc)) ||
      /submit|apply|upload resume/i.test(desc)
    ) {
      const reviewBtn = analysis.pageModel.buttons.find((b) =>
        /review|confirm|preview|next|continue to submit/i.test(`${b.text} ${b.ariaLabel}`),
      );
      const submitBtn = analysis.pageModel.buttons.find((b) =>
        /^submit$|^confirm$|^send application/i.test(`${b.text} ${b.ariaLabel}`.trim()),
      );

      if (reviewBtn && !submitBtn) {
        insertSteps.push({
          action: 'click',
          target: reviewBtn.selector,
          description: `Insert review step: click "${reviewBtn.text}"`,
        });
        this.logger.log(`[WorkflowHealer] Detected extra review step: ${reviewBtn.text}`);
      } else if (submitBtn && context.error.includes('not found') && context.target !== submitBtn.selector) {
        return {
          type: 'workflow',
          healed: true,
          alternativeSelector: submitBtn.selector,
          recoverySteps: [],
          insertSteps: [],
          explanation: `Workflow changed — submit button is now "${submitBtn.text}"`,
          confidence: 0.78,
          resumeAfterRecovery: true,
        };
      }
    }

    // Multi-step form: detect visible "Next" when step failed on hidden submit
    if (context.error.includes('not found') || context.error.includes('timeout')) {
      const nextBtn = analysis.pageModel.buttons.find((b) =>
        /^next$|^continue$|^proceed$/i.test(`${b.text} ${b.ariaLabel}`.trim()),
      );
      if (nextBtn && action === 'click') {
        return {
          type: 'workflow',
          healed: true,
          alternativeSelector: nextBtn.selector,
          recoverySteps: [],
          explanation: `Multi-step form detected — use "${nextBtn.text}" before final submit`,
          confidence: 0.72,
          resumeAfterRecovery: true,
        };
      }
    }

    if (insertSteps.length > 0) {
      return {
        type: 'workflow',
        healed: true,
        recoverySteps: [],
        insertSteps,
        explanation: 'Site workflow changed — inserting intermediate step(s)',
        confidence: 0.75,
        resumeAfterRecovery: true,
      };
    }

    return this.noHeal('No workflow change detected');
  }

  private noHeal(reason: string): RecoveryPlan {
    return {
      type: 'workflow',
      healed: false,
      recoverySteps: [],
      explanation: reason,
      confidence: 0,
      resumeAfterRecovery: false,
    };
  }
}
