import { Injectable, Logger } from '@nestjs/common';
import { RecoveryEngineService } from './runtime/self-healing/recovery-engine.service';
import { HealingContext } from './runtime/self-healing/healing.types';
import { PrismaService } from '../prisma/prisma.service';

export interface HealingRequest {
  sessionId: string;
  stepIndex: number;
  action: string;
  target?: string;
  value?: string;
  description: string;
  error: string;
  screenshot: string;
  url?: string;
  title?: string;
  rawDom?: HealingContext['rawDom'];
  viewport?: { width: number; height: number };
}

export interface HealingResponse {
  healed: boolean;
  alternativeSelector?: string;
  recoverySteps?: Array<{
    action: string;
    target?: string;
    value?: string;
    description: string;
  }>;
  insertSteps?: Array<{
    action: string;
    target?: string;
    value?: string;
    description: string;
  }>;
  explanation: string;
  recoveryType?: string;
  confidence?: number;
  attemptNumber?: number;
  visionAnalysis?: {
    pageState: string;
    buttonCount: number;
    siteKey: string;
  };
}

@Injectable()
export class SelfHealingService {
  private readonly logger = new Logger(SelfHealingService.name);

  constructor(
    private recoveryEngine: RecoveryEngineService,
    private prisma: PrismaService,
  ) {}

  async attemptHealing(req: HealingRequest): Promise<HealingResponse> {
    this.logger.log(
      `[SelfHealing] Vision → Recovery for session ${req.sessionId}, step ${req.stepIndex} ("${req.action}")`,
    );

    const context: HealingContext = {
      sessionId: req.sessionId,
      stepIndex: req.stepIndex,
      action: req.action,
      target: req.target,
      value: req.value,
      description: req.description,
      error: req.error,
      screenshot: req.screenshot,
      url: req.url,
      title: req.title,
      rawDom: req.rawDom,
      viewport: req.viewport,
    };

    const result = await this.recoveryEngine.recover(context);
    const { plan, analysis, attemptNumber } = result;

    const response: HealingResponse = {
      healed: result.healed,
      alternativeSelector: plan.alternativeSelector,
      recoverySteps: plan.recoverySteps,
      insertSteps: plan.insertSteps,
      explanation: plan.explanation,
      recoveryType: plan.type,
      confidence: plan.confidence,
      attemptNumber,
      visionAnalysis: analysis
        ? {
            pageState: analysis.layout.pageState,
            buttonCount: analysis.pageModel.buttons.length,
            siteKey: analysis.pageModel.url,
          }
        : undefined,
    };

    if (result.healed) {
      await this.prisma.agentExecutionStep
        .update({
          where: {
            sessionId_stepIndex: {
              sessionId: req.sessionId,
              stepIndex: req.stepIndex,
            },
          },
          data: {
            visionAnalysis: {
              healed: true,
              recoveryType: plan.type,
              originalSelector: req.target,
              newSelector: plan.alternativeSelector,
              confidence: plan.confidence,
              reasoning: plan.explanation,
              attemptNumber,
            },
          },
        })
        .catch(() => {/* step may not exist in DB yet */});
    }

    return response;
  }
}
