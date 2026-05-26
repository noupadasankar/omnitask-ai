import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ExecutionService } from '../execution/execution.service';
import { MemoryService } from '../memory/memory.service';
import { ToolRegistryService } from './tools/tool-registry.service';
import { WebsocketService } from '../websocket/websocket.service';
import { StepStatus } from '../execution/enums/execution-status.enum';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @Inject(forwardRef(() => ExecutionService))
    private readonly executionService: ExecutionService,
    private readonly memoryService: MemoryService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly websocket: WebsocketService,
  ) {}

  async runAgentLoop(executionId: string, steps: unknown[], userId?: string): Promise<void> {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] as Record<string, unknown>;

      if (userId) {
        this.websocket.emitToUser(userId, 'agent:step:start', { executionId, stepIndex: i, step });
      }

      try {
        await this.executionService.updateStepStatus(
          executionId,
          i,
          StepStatus.RUNNING,
          undefined,
          undefined,
          {
            stepType: String(step.type ?? 'unknown'),
            action: String(step.action ?? 'execute'),
            input: step.input,
          },
        );

        const result = await this.executeStep(step);

        await this.executionService.updateStepStatus(
          executionId,
          i,
          StepStatus.COMPLETED,
          result,
        );

        if (userId) {
          this.websocket.emitToUser(userId, 'agent:step:result', {
            executionId,
            stepIndex: i,
            result,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.executionService.updateStepStatus(
          executionId,
          i,
          StepStatus.FAILED,
          null,
          message,
        );

        if (userId) {
          this.websocket.emitToUser(userId, 'agent:step:error', {
            executionId,
            stepIndex: i,
            error: message,
          });
        }
        throw err;
      }
    }
  }

  async getStepResults(executionId: string): Promise<unknown[]> {
    const steps = await this.executionService.getExecutionSteps(executionId);
    return steps.map((s) => ({
      success: s.status === StepStatus.COMPLETED,
      output: s.output,
      action: s.action,
    }));
  }

  async executeStep(step: Record<string, unknown>): Promise<unknown> {
    const type = String(step.type ?? '');

    switch (type) {
      case 'analysis':
        return {
          success: true,
          type: 'analysis',
          description: step.description,
          timestamp: new Date().toISOString(),
        };

      case 'execution':
        return {
          success: true,
          type: 'execution',
          description: step.description,
          timestamp: new Date().toISOString(),
        };

      case 'tool': {
        const action = String(step.action ?? '');
        const input = step.input;
        const result = await this.toolRegistry.execute(action, input);
        return { success: true, tool: action, result, timestamp: new Date().toISOString() };
      }

      default:
        return { ok: true, stepType: type };
    }
  }

  async selfHeal(
    executionId: string,
    error: unknown,
    userId?: string,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Self-healing ${executionId}: ${message}`);

    const event = {
      executionId,
      error: message,
      timestamp: new Date().toISOString(),
    };

    if (userId) {
      this.websocket.emitToUser(userId, 'agent:selfheal', event);
    } else {
      this.websocket.broadcast('agent:selfheal', event);
    }
  }
}
