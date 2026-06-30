import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { AgentService } from '../agent/agent.service';
import { ExecutionService } from './execution.service';
import { WebsocketService } from '../websocket/websocket.service';
import { StepStatus } from './enums/execution-status.enum';

@Processor('tasks')
export class ExecutionStepWorker {
  private readonly logger = new Logger(ExecutionStepWorker.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly executionService: ExecutionService,
    private readonly websocket: WebsocketService,
  ) {}

  @Process('process-step')
  async handleStep(
    job: Job<{
      taskId: string;
      executionId: string;
      userId: string;
      stepIndex: number;
      step: Record<string, unknown>;
      attempt?: number;
    }>,
  ) {
    const { executionId, userId, stepIndex, step, taskId, attempt = 1 } = job.data;

    this.websocket.emitToUser(userId, 'agent:step:start', {
      executionId,
      taskId,
      stepIndex,
      step,
      attempt,
    });

    await this.executionService.updateStepStatus(
      executionId,
      stepIndex,
      StepStatus.RUNNING,
      undefined,
      undefined,
      {
        stepType: String(step.type ?? 'unknown'),
        action: String(step.action ?? 'execute'),
        input: step.input,
      },
    );

    try {
      const result = await this.agentService.executeStep(step);
      await this.executionService.updateStepStatus(
        executionId,
        stepIndex,
        StepStatus.COMPLETED,
        result,
      );

      this.websocket.emitToUser(userId, 'agent:step:result', {
        executionId,
        stepIndex,
        result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.executionService.updateStepStatus(
        executionId,
        stepIndex,
        StepStatus.FAILED,
        null,
        message,
      );

      this.websocket.emitToUser(userId, 'agent:step:error', {
        executionId,
        stepIndex,
        error: message,
        attempt,
      });

      if (attempt < 2) {
        this.logger.warn(`Retrying step ${stepIndex} (attempt ${attempt + 1})`);
        await this.executionService.enqueueStep(
          taskId,
          executionId,
          userId,
          stepIndex,
          step,
          attempt + 1,
        );
        return;
      }

      throw err;
    }
  }
}
