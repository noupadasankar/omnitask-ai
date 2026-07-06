import { Injectable, Logger } from '@nestjs/common';
import { VisionOrchestratorService } from '../../../vision/vision-orchestrator.service';
import { SelectorHealerService } from './selector-healer.service';
import { NavigationHealerService } from './navigation-healer.service';
import { WorkflowHealerService } from './workflow-healer.service';
import { RetryManagerService } from './retry-manager.service';
import { HealingContext, HealingResult, RecoveryPlan } from './healing.types';

@Injectable()
export class RecoveryEngineService {
  private readonly logger = new Logger(RecoveryEngineService.name);

  constructor(
    private vision: VisionOrchestratorService,
    private selectorHealer: SelectorHealerService,
    private navigationHealer: NavigationHealerService,
    private workflowHealer: WorkflowHealerService,
    private retryManager: RetryManagerService,
  ) {}

  /**
   * Full recovery pipeline:
   * Vision Analysis → Navigation check → Popup → Selector → Workflow → Retry plan
   */
  async recover(context: HealingContext): Promise<HealingResult> {
    const attemptNumber = this.retryManager.recordAttempt(context.sessionId, context.stepIndex);

    if (!this.retryManager.shouldRetry(context)) {
      return {
        healed: false,
        attemptNumber,
        plan: {
          type: 'selector',
          healed: false,
          recoverySteps: [],
          explanation: 'Max recovery attempts exceeded',
          confidence: 0,
          resumeAfterRecovery: false,
        },
      };
    }

    this.logger.log(
      `[RecoveryEngine] Attempt ${attemptNumber} for session ${context.sessionId} step ${context.stepIndex}`,
    );

    let analysis = context.rawDom && context.url
      ? this.vision.analyzePage(context.url, context.title || '', context.rawDom, context.viewport)
      : undefined;

    // ── Step 1: Navigation / blocker analysis ─────────────────────────────
    const navPlan = await this.navigationHealer.attempt(context);
    if (navPlan.confidence >= 0.9 && !navPlan.healed && navPlan.type === 'navigation') {
      return { healed: false, plan: navPlan, analysis, attemptNumber };
    }

    // ── Step 2: Popup dismiss ─────────────────────────────────────────────
    if (analysis?.layout.hasModal && analysis.layout.pageState === 'blocked_by_popup') {
      const popupPlan = await this.selectorHealer.attempt(context);
      if (popupPlan.healed && popupPlan.type === 'popup_dismiss') {
        return { healed: true, plan: popupPlan, analysis, attemptNumber };
      }
    }

    // ── Step 3: Selector recovery (primary) ───────────────────────────────
    const selectorPlan = await this.selectorHealer.attempt(context);
    if (selectorPlan.healed) {
      return { healed: true, plan: selectorPlan, analysis, attemptNumber };
    }

    // ── Step 4: Workflow recovery ─────────────────────────────────────────
    const workflowPlan = await this.workflowHealer.attempt(context);
    if (workflowPlan.healed) {
      return { healed: true, plan: workflowPlan, analysis, attemptNumber };
    }

    // ── Step 5: Navigation recovery with steps ────────────────────────────
    if (navPlan.recoverySteps.length > 0 && navPlan.resumeAfterRecovery) {
      return { healed: true, plan: navPlan, analysis, attemptNumber };
    }

    const bestPlan = this.pickBestPlan([selectorPlan, workflowPlan, navPlan]);
    return { healed: false, plan: bestPlan, analysis, attemptNumber };
  }

  private pickBestPlan(plans: RecoveryPlan[]): RecoveryPlan {
    return plans.reduce((best, p) => (p.confidence > best.confidence ? p : best), plans[0]);
  }
}
