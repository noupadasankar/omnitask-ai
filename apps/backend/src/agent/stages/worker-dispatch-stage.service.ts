import { Injectable, Logger } from '@nestjs/common';
import { WorkerDispatcherService } from '../runtime/worker-dispatcher.service';
import { SessionManagerService } from '../runtime/session-manager.service';
import { ExecutionEventBus } from '../../event-bus/execution-event-bus.service';
import { ExecutionContext, PipelineExitReason } from './execution-context';
import { IExecutionStage } from './execution-stage.interface';

const SKILL_BY_DOMAIN: Record<string, string> = {
  job: 'job_application',
  shopping: 'shopping',
  food: 'food',
  research: 'research',
  social: 'social',
  email: 'email',
  media: 'media',
};

@Injectable()
export class WorkerDispatchStage implements IExecutionStage {
  private readonly logger = new Logger(WorkerDispatchStage.name);

  constructor(
    private readonly workerDispatcher: WorkerDispatcherService,
    private readonly sessionManager: SessionManagerService,
    private readonly eventBus: ExecutionEventBus,
  ) {}

  async execute(ctx: ExecutionContext): Promise<void> {
    const { sessionId } = ctx;

    ctx.skillHint =
      SKILL_BY_DOMAIN[ctx.routedDomain ?? ''] ||
      (ctx.plan?.skillsUsed?.length === 0 ? 'web_task' : undefined);

    const dispatched = await this.workerDispatcher.dispatch(
      sessionId,
      ctx.taskId!,
      ctx.userId!,
      ctx.goal,
      ctx.plan!,
      ctx.executionGraph ?? {},
      ctx.config,
      ctx.skillHint,
    );

    if (dispatched) {
      this.eventBus.emit(sessionId, 'execution:event', {
        type: 'log:info',
        data: {
          source: 'WorkerRuntime',
          message: `Execution delegated to browser worker (${ctx.plan?.steps.length} steps). Live stream starting...`,
        },
      });
      ctx.dispatchedToWorker = true;
      ctx.exitReason = PipelineExitReason.WORKER_DISPATCHED;
      return;
    }

    if (ctx.skillHint) {
      const message =
        'Live browser engine (Python) is offline — the autonomous run and the ' +
        'live Chromium stream both run there. Start it:  python apps/browser-py/main.py  ' +
        '(headful), then relaunch. The browser will open and stream live.';
      this.logger.error(
        `[ExecutionEngine] Python engine offline for skill "${ctx.skillHint}" — refusing inline fallback (no live stream / cannot run skill).`,
      );
      this.eventBus.emit(sessionId, 'execution:event', {
        type: 'log:error',
        data: { source: 'WorkerRuntime', message },
      });
      throw new Error(message);
    }

    // Inline execution path
    ctx.executedInline = true;
  }
}
