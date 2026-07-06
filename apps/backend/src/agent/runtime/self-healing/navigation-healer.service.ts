import { Injectable, Logger } from '@nestjs/common';
import { VisionOrchestratorService } from '../../../vision/vision-orchestrator.service';
import { HealingContext, RecoveryPlan } from './healing.types';

@Injectable()
export class NavigationHealerService {
  private readonly logger = new Logger(NavigationHealerService.name);

  constructor(private vision: VisionOrchestratorService) {}

  async attempt(context: HealingContext): Promise<RecoveryPlan> {
    if (!context.url || !context.rawDom) {
      return this.noHeal('No navigation context');
    }

    const analysis = this.vision.analyzePage(
      context.url,
      context.title || '',
      context.rawDom,
      context.viewport,
    );

    const { pageState } = analysis.layout;
    const url = context.url.toLowerCase();

    // Type 2 — Auth wall / login redirect
    if (
      pageState === 'login_wall' ||
      url.includes('authwall') ||
      url.includes('/login') ||
      url.includes('/signin') ||
      url.includes('/checkpoint')
    ) {
      this.logger.warn(`[NavigationHealer] Login wall detected at ${context.url}`);

      const signInBtn = analysis.pageModel.buttons.find((b) =>
        /sign in|log in|continue with/i.test(`${b.text} ${b.ariaLabel}`),
      );

      const steps = signInBtn
        ? [{ action: 'click', target: signInBtn.selector, description: 'Trigger login flow — user approval required' }]
        : [];

      return {
        type: 'navigation',
        healed: false,
        recoverySteps: steps,
        explanation: 'Redirected to login/auth wall. Manual login or saved session required before resuming.',
        confidence: 0.9,
        resumeAfterRecovery: false,
      };
    }

    // CAPTCHA — escalate, don't auto-heal
    if (pageState === 'captcha_present') {
      return {
        type: 'navigation',
        healed: false,
        recoverySteps: [],
        explanation: 'CAPTCHA detected. Requires human intervention.',
        confidence: 0.95,
        resumeAfterRecovery: false,
      };
    }

    // Unexpected URL vs expected
    if (context.expectedUrl && !url.includes(context.expectedUrl.toLowerCase())) {
      return {
        type: 'navigation',
        healed: false,
        recoverySteps: [
          {
            action: 'navigate',
            value: context.expectedUrl,
            description: `Navigate back to expected URL: ${context.expectedUrl}`,
          },
        ],
        explanation: `Expected ${context.expectedUrl} but landed on ${context.url}`,
        confidence: 0.7,
        resumeAfterRecovery: true,
      };
    }

    return this.noHeal('Navigation state is normal');
  }

  private noHeal(reason: string): RecoveryPlan {
    return {
      type: 'navigation',
      healed: false,
      recoverySteps: [],
      explanation: reason,
      confidence: 0,
      resumeAfterRecovery: false,
    };
  }
}
