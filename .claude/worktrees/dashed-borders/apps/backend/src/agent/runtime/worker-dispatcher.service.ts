import { Injectable, Logger } from '@nestjs/common';
import { AgentPlan, BrowserSessionConfig } from '../../shared/interfaces/agent.interfaces';
import { ExecutionGraph } from './execution-graph.interface';
import { PythonBridgeService } from './python-bridge.service';

type RuntimeMode = 'python' | 'inline';

@Injectable()
export class WorkerDispatcherService {
  private readonly logger = new Logger(WorkerDispatcherService.name);

  constructor(private pythonBridge: PythonBridgeService) {}

  /**
   * Browser execution runtime, selected via BROWSER_RUNTIME:
   *   - 'python' (default) → Playwright Python engine (apps/browser-py) via Redis bridge
   *   - 'inline'           → in-process Puppeteer in the API (fallback)
   */
  runtimeMode(): RuntimeMode {
    return (process.env.BROWSER_RUNTIME || 'python').toLowerCase() === 'inline'
      ? 'inline'
      : 'python';
  }

  /**
   * Returns true when the job was handed to the Python engine and it is
   * confirmed alive. Returns false to make ExecutionEngine fall back to the
   * in-process Puppeteer path — a job is never silently abandoned.
   */
  async dispatch(
    sessionId: string,
    taskId: string,
    userId: string,
    goal: string,
    plan: AgentPlan,
    _graph: ExecutionGraph,
    config?: Partial<BrowserSessionConfig>,
    skillHint?: string,
  ): Promise<boolean> {
    if (this.runtimeMode() === 'inline') return false;

    const alive = await this.pythonBridge.isAlive();
    if (!alive) {
      this.logger.warn(
        '[WorkerDispatcher] Python engine offline (no heartbeat) → inline Puppeteer fallback',
      );
      return false;
    }

    try {
      await this.pythonBridge.dispatch(
        this.buildJob(sessionId, taskId, userId, goal, plan, config, skillHint),
      );
      this.logger.log(
        `[WorkerDispatcher] python → LPUSH omnitask:py:jobs | session=${sessionId} | steps=${plan.steps.length}`,
      );
      return true;
    } catch (err: any) {
      this.logger.warn(
        `[WorkerDispatcher] Python dispatch failed: ${err.message} → inline fallback`,
      );
      return false;
    }
  }

  /** Plain-JSON job the Python engine BRPOPs from omnitask:py:jobs. */
  private buildJob(
    sessionId: string,
    taskId: string,
    userId: string,
    goal: string,
    plan: AgentPlan,
    config?: Partial<BrowserSessionConfig>,
    skillHint?: string,
  ) {
    return {
      sessionId,
      taskId,
      userId,
      goal,
      // When set, the Python engine runs this domain skill (real search/extract/
      // AI) instead of the step plan. Only sent when no site plugin matched.
      skill: skillHint,
      plan: {
        steps: plan.steps.map((s) => ({
          index: s.index,
          action: s.action,
          target: s.target,
          value: s.value,
          description: s.description,
          requiresApproval: s.requiresApproval,
          waitCondition: s.waitCondition
            ? { type: s.waitCondition.type, value: s.waitCondition.value }
            : undefined,
        })),
        totalSteps: plan.steps.length,
      },
      config: {
        headless: config?.headless ?? true,
        viewport: config?.viewport ?? { width: 1280, height: 800 },
        timeout: config?.timeout,
      },
    };
  }
}
