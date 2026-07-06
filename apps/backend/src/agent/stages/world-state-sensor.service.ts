import { Injectable, Logger } from '@nestjs/common';
import { WorldStateService } from '../world-state.service';
import { ExecutionEventBus } from '../../event-bus/execution-event-bus.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExecutionContext } from './execution-context';
import { AgentPlan, PlannedStep } from '../../shared/interfaces/agent.interfaces';

export interface BlockerCheckResult {
  isBlocker: boolean;
  blockerReason: string;
  blockerType: 'WAITING_APPROVAL' | 'WAITING_OTP';
}

@Injectable()
export class WorldStateSensor {
  private readonly logger = new Logger(WorldStateSensor.name);

  constructor(
    private readonly worldState: WorldStateService,
    private readonly eventBus: ExecutionEventBus,
  ) {}

  async postStep(
    ctx: ExecutionContext,
    step: PlannedStep,
    isLogin: boolean,
    isPayment: boolean,
    isOtp: boolean,
    isCaptcha: boolean,
    afterScreenshot: string | null,
    validationCompleted: boolean | null,
    validationConfidence: number | null,
  ): Promise<void> {
    const { sessionId } = ctx;

    if (isLogin) {
      this.worldState.updateBelief(sessionId, 'authStatus', 'logging_in', 'DOM_DIRECT', 0.92);
      this.worldState.updateBelief(sessionId, 'isFormPresent', true, 'DOM_DIRECT', 0.95);
      this.worldState.updateBelief(sessionId, 'activeStage', 'navigation', 'DOM_DIRECT', 0.80);
    }
    if (isPayment) {
      this.worldState.updateBelief(sessionId, 'isCheckoutDetect', true, 'DOM_DIRECT', 0.96);
      this.worldState.updateBelief(sessionId, 'activeStage', 'transaction', 'DOM_DIRECT', 0.92);
      this.worldState.updateBelief(sessionId, 'hostilityIndex', 0.7, 'DOM_DIRECT', 0.85);
    }
    if (isOtp || isCaptcha) {
      this.worldState.updateBelief(sessionId, 'hostilityIndex', 0.85, 'DOM_DIRECT', 0.9);
      this.worldState.updateBelief(sessionId, 'isModalActive', true, 'DOM_DIRECT', 0.88);
    }

    if (afterScreenshot && validationConfidence !== null) {
      this.worldState.updateBelief(sessionId, 'pageVolatility',
        validationCompleted ? 0.1 : 0.7,
        'VISION_INFERRED',
        validationConfidence,
      );
    }

    const wso = this.worldState.getState(sessionId);
    if (wso) {
      this.eventBus.emit(sessionId, 'cos:world_state', {
        stateConfidence: wso.stateConfidence,
        beliefSourceConsensus: wso.beliefSourceConsensus,
        version: wso.version,
        belief: Object.fromEntries(
          Object.entries(wso.belief).map(([k, v]) => [k, { value: v.value, confidence: v.sourceConfidence, source: v.source }]),
        ),
      });
    }
  }

  detectBlockers(
    isLogin: boolean,
    isPayment: boolean,
    isOtp: boolean,
    isCaptcha: boolean,
    loginData: any,
    otpData: any,
    captchaData: any,
    paymentData: any,
    visionBlocker: { hasBlocker: boolean; description?: string; blockerType?: string } | null,
    validationConfidence: number | null,
  ): BlockerCheckResult | null {
    if (isLogin) {
      return {
        isBlocker: true,
        blockerReason: `Login form detected: ${loginData?.reasons?.join(', ') || 'login wall'}`,
        blockerType: 'WAITING_APPROVAL',
      };
    }
    if (isPayment) {
      return {
        isBlocker: true,
        blockerReason: `Payment or checkout flow detected: ${paymentData?.reasons?.join(', ') || 'payment gate'}`,
        blockerType: 'WAITING_APPROVAL',
      };
    }
    if (isOtp) {
      return {
        isBlocker: true,
        blockerReason: `One-time password or SMS verification code detected: ${otpData?.reasons?.join(', ') || 'OTP prompt'}`,
        blockerType: 'WAITING_OTP',
      };
    }
    if (isCaptcha) {
      return {
        isBlocker: true,
        blockerReason: `CAPTCHA verification detected: ${captchaData?.reasons?.join(', ') || 'captcha challenge'}`,
        blockerType: 'WAITING_APPROVAL',
      };
    }
    if (visionBlocker?.hasBlocker) {
      return {
        isBlocker: true,
        blockerReason: visionBlocker.description || `Page blocker detected: ${visionBlocker.blockerType}`,
        blockerType: 'WAITING_APPROVAL',
      };
    }
    if (validationConfidence !== null && validationConfidence < 0.8) {
      return {
        isBlocker: true,
        blockerReason: `Validation confidence is low (${validationConfidence}). Please verify the page state.`,
        blockerType: 'WAITING_APPROVAL',
      };
    }
    return null;
  }

  emitWorldStateFinal(ctx: ExecutionContext): void {
    const wso = this.worldState.getState(ctx.sessionId);
    if (wso) {
      this.eventBus.emit(ctx.sessionId, 'cos:world_state_final', {
        stateConfidence: wso.stateConfidence,
        beliefSourceConsensus: wso.beliefSourceConsensus,
        version: wso.version,
        historyLength: Object.keys(wso.history).length,
      });
    }
  }

  removeSession(sessionId: string): void {
    this.worldState.removeSession(sessionId);
  }
}
