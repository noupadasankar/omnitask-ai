import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { AgentCoreService } from '../agent/agent-core.service';
import { AgentService } from '../agent/agent.service';
import { WebsocketService } from '../websocket/websocket.service';

@Processor('tasks')
export class ExecutionTaskWorker {
  private readonly logger = new Logger(ExecutionTaskWorker.name);

  constructor(
    private readonly executionService: ExecutionService,
    private readonly agentCore: AgentCoreService,
    private readonly agentService: AgentService,
    private readonly websocket: WebsocketService,
  ) {}

  @Process('process-task')
  async handleTask(
    job: Job<{
      taskId: string;
      executionId: string;
      steps: unknown[];
      userId: string;
      goal?: string;
    }>,
  ) {
    const { executionId, steps, userId, taskId, goal } = job.data;

    this.websocket.emitToUser(userId, 'agent:started', {
      executionId,
      taskId,
      stepCount: steps?.length ?? 0,
    });

    try {
      const result = await this.agentCore.runCycle(executionId, steps ?? [], {
        userId,
        taskId,
        goal: goal ?? '',
      });

      await this.executionService.completeExecution(
        executionId,
        result.critique.passed,
        result.critique.passed ? undefined : result.critique.feedback,
      );

      this.websocket.emitToUser(userId, 'agent:completed', {
        executionId,
        taskId,
        critique: result.critique,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Execution failed: ${message}`);

      await this.agentService.selfHeal(executionId, err, userId);
      await this.executionService.completeExecution(executionId, false, message);

      this.websocket.emitToUser(userId, 'agent:error', { executionId, taskId, error: message });
      this.websocket.emitToUser(userId, 'agent:selfheal', { executionId, error: message });
    }
  }
}
