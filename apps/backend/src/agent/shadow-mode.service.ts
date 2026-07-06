import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MockBrowserProvider, SimulationTrace } from './providers/mock-browser-provider.service';
import { AgentPlan } from '../shared/interfaces/agent.interfaces';
import { PrismaService } from '../prisma/prisma.service';

export interface ShadowModeReport {
  sessionId: string;
  plan: AgentPlan;
  trace: SimulationTrace;
  summary: {
    totalSteps: number;
    totalActions: number;
    simulatedDurationMs: number;
    warnings: string[];
    wouldSucceed: boolean;
  };
}

@Injectable()
export class ShadowModeService {
  private readonly logger = new Logger(ShadowModeService.name);

  constructor(
    private readonly mockBrowser: MockBrowserProvider,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async runSimulation(
    userId: string,
    taskId: string,
    plan: AgentPlan,
    sessionId: string,
  ): Promise<ShadowModeReport> {
    this.logger.log(`[SHADOW] Starting simulation: session=${sessionId}`);

    await this.mockBrowser.launch(sessionId, userId, { headless: true });
    const warnings: string[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      this.eventEmitter.emit('shadow:step', {
        sessionId,
        stepIndex: i,
        action: step.action,
        status: 'running',
      });

      try {
        switch (step.action) {
          case 'navigate':
            await this.mockBrowser.navigate(sessionId, step.value || '');
            break;
          case 'click':
            await this.mockBrowser.click(sessionId, step.target || '');
            break;
          case 'type':
            await this.mockBrowser.type(sessionId, step.target || '', step.value || '');
            break;
          default:
            warnings.push(`Step ${i}: unknown action "${step.action}" — skipped`);
        }
      } catch (error: any) {
        warnings.push(`Step ${i}: ${step.action} failed — ${error.message}`);
      }

      this.eventEmitter.emit('shadow:step', {
        sessionId,
        stepIndex: i,
        action: step.action,
        status: 'complete',
      });
    }

    await this.mockBrowser.close(sessionId);
    const trace = this.mockBrowser.getTrace(sessionId)!;

    const report: ShadowModeReport = {
      sessionId,
      plan,
      trace,
      summary: {
        totalSteps: plan.steps.length,
        totalActions: trace.totalActions,
        simulatedDurationMs: trace.endTime - trace.startTime,
        warnings,
        wouldSucceed: warnings.length === 0,
      },
    };

    await this.prisma.executionSession.update({
      where: { id: sessionId },
      data: {
        metadata: {
          shadowMode: true,
          shadowReport: report,
        } as any,
      },
    });

    this.logger.log(
      `[SHADOW] Simulation complete: ${trace.totalActions} actions, ${warnings.length} warnings, ` +
      `wouldSucceed=${report.summary.wouldSucceed}`,
    );

    return report;
  }
}
