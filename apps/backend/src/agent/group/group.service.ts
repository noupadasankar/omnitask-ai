import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentMessageBusService } from '../message-bus/message-bus.service';

export interface AgentGroupTask {
  id: string;
  agentId: string;
  role: string;
  instruction: string;
  context: Record<string, unknown>;
}

export interface AgentGroupResult {
  taskId: string;
  agentId: string;
  role: string;
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

export interface AgentGroupBatch {
  groupId: string;
  sessionId: string;
  tasks: AgentGroupTask[];
  strategy: 'parallel' | 'sequential' | 'race';
  results: AgentGroupResult[];
  startedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'running' | 'completed' | 'partial' | 'failed';
}

@Injectable()
export class AgentGroupService {
  private readonly logger = new Logger(AgentGroupService.name);
  private readonly activeBatches = new Map<string, AgentGroupBatch>();

  constructor(
    private readonly messageBus: AgentMessageBusService,
    private readonly config: ConfigService,
  ) {}

  async runGroup(
    sessionId: string,
    tasks: AgentGroupTask[],
    strategy: 'parallel' | 'sequential' | 'race' = 'parallel',
  ): Promise<AgentGroupResult[]> {
    const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const batch: AgentGroupBatch = {
      groupId,
      sessionId,
      tasks,
      strategy,
      results: [],
      startedAt: new Date(),
      status: 'running',
    };
    this.activeBatches.set(groupId, batch);

    try {
      let results: AgentGroupResult[];

      switch (strategy) {
        case 'parallel':
          results = await this.runParallel(tasks, sessionId);
          break;
        case 'sequential':
          results = await this.runSequential(tasks, sessionId);
          break;
        case 'race':
          results = await this.runRace(tasks, sessionId);
          break;
        default:
          results = await this.runParallel(tasks, sessionId);
      }

      batch.results = results;
      batch.completedAt = new Date();
      batch.status = results.every((r) => r.success) ? 'completed' :
        results.some((r) => r.success) ? 'partial' : 'failed';

      await this.messageBus.publish(`agent:group:${groupId}:complete`, {
        groupId,
        sessionId,
        results,
        status: batch.status,
      });

      return results;
    } catch (err: any) {
      batch.status = 'failed';
      batch.completedAt = new Date();
      this.logger.error(`Group ${groupId} failed: ${err.message}`);
      return [];
    } finally {
      setTimeout(() => this.activeBatches.delete(groupId), 60000);
    }
  }

  async getBatchStatus(groupId: string): Promise<AgentGroupBatch | undefined> {
    return this.activeBatches.get(groupId);
  }

  async mergeResults(results: AgentGroupResult[]): Promise<{ merged: any; sources: string[] }> {
    const sources: string[] = [];
    const outputs: Record<string, unknown> = {};

    for (const r of results) {
      if (r.success) {
        sources.push(r.role);
        outputs[r.role] = r.output;
      }
    }

    return {
      merged: this.mergeOutputs(outputs),
      sources,
    };
  }

  private async runParallel(tasks: AgentGroupTask[], sessionId: string): Promise<AgentGroupResult[]> {
    const promises = tasks.map((task) => this.executeTask(task, sessionId));
    return Promise.all(promises);
  }

  private async runSequential(tasks: AgentGroupTask[], sessionId: string): Promise<AgentGroupResult[]> {
    const results: AgentGroupResult[] = [];
    for (const task of tasks) {
      const result = await this.executeTask(task, sessionId);
      results.push(result);
      if (!result.success) break;
    }
    return results;
  }

  private async runRace(tasks: AgentGroupTask[], sessionId: string): Promise<AgentGroupResult[]> {
    const firstResult = await Promise.race(tasks.map((task) => this.executeTask(task, sessionId)));
    return [firstResult];
  }

  private async executeTask(task: AgentGroupTask, sessionId: string): Promise<AgentGroupResult> {
    const startTime = Date.now();
    try {
      await this.messageBus.publish(`agent:task:${task.agentId}`, {
        taskId: task.id,
        sessionId,
        instruction: task.instruction,
        context: task.context,
      });

      const result = await this.messageBus.request(`agent:task:${task.agentId}:result`, {}, 30000);

      return {
        taskId: task.id,
        agentId: task.agentId,
        role: task.role,
        success: true,
        output: result?.payload || { completed: true },
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        taskId: task.id,
        agentId: task.agentId,
        role: task.role,
        success: false,
        output: null,
        error: err.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private mergeOutputs(outputs: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(outputs)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(result, value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
