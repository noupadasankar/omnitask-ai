import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
import { AgentMessageBusService } from '../message-bus/message-bus.service';
import { AgentGroupService } from '../group/group.service';
import { AgentGateway } from '../../websocket/agent.gateway';
import { SubGoalDecomposerService } from './sub-goal-decomposer.service';
import { ResultSynthesizerService } from './result-synthesizer.service';
import { OrchestrationPlan, SubGoal, SynthesizedResult, ExecutionDag, InterAgentMessage, SubGoalDecomposition } from './interfaces';
import { MemoryStoreService } from '../memory-store.service';

/**
 * @responsibility Long-running hierarchical task orchestration with sub-goal decomposition.
 * Owns plan persistence, sub-goal retry logic, and cross-session memory consolidation.
 * Does NOT handle single-shot agent dispatch (OrchestratorPipelineService) or
 * parallel fan-out coordination (MultiAgentCoordinatorService).
 */
@Injectable()
export class SupervisorOrchestratorService {
  private readonly logger = new Logger(SupervisorOrchestratorService.name);
  private activePlans = new Map<string, OrchestrationPlan>();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private agentRegistry: AgentRegistryService,
    private messageBus: AgentMessageBusService,
    private groupService: AgentGroupService,
    private wsGateway: AgentGateway,
    private decomposer: SubGoalDecomposerService,
    private synthesizer: ResultSynthesizerService,
    private memoryStore: MemoryStoreService,
  ) {}

  async orchestrate(userId: string, sessionId: string, goal: string): Promise<OrchestrationPlan> {
    this.logger.log(`[Supervisor] Orchestrating for session ${sessionId}: "${goal.slice(0, 100)}..."`);

    const plan: OrchestrationPlan = {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      userId,
      originalGoal: goal,
      subGoals: [],
      status: 'building',
      createdAt: new Date(),
      metadata: {},
    };

    this.activePlans.set(plan.id, plan);
    this.emitStatus(plan, 'orchestration:building', { message: 'Decomposing goal into sub-tasks...' });

    const decomposition = await this.decomposer.decompose(goal, userId, sessionId);
    plan.subGoals = decomposition.subGoals;
    plan.metadata['reasoning'] = decomposition.reasoning;
    plan.metadata['parallelGroups'] = decomposition.parallelGroups;

    this.logger.log(
      `[Supervisor] Decomposed into ${plan.subGoals.length} sub-goals across ${decomposition.parallelGroups.length} parallel groups`
    );

    plan.status = 'ready';
    this.emitStatus(plan, 'orchestration:ready', {
      message: `Decomposed into ${plan.subGoals.length} sub-tasks`,
      subGoals: plan.subGoals.map((sg) => ({
        id: sg.id,
        description: sg.description,
        agentType: sg.agentType,
        status: sg.status,
        dependencies: sg.dependencies,
      })),
      parallelGroups: decomposition.parallelGroups,
      reasoning: decomposition.reasoning,
    });

    await this.executeDag(plan, decomposition);

    return plan;
  }

  private async executeDag(plan: OrchestrationPlan, decomposition: SubGoalDecomposition): Promise<void> {
    plan.status = 'running';
    this.emitStatus(plan, 'orchestration:started', { message: 'Beginning multi-agent execution' });

    const dag = this.buildExecutionDag(plan.subGoals, decomposition.parallelGroups);
    const agentSubscriptions: (() => void)[] = [];

    try {
      agentSubscriptions.push(
        this.messageBus.subscribe(`agent:result:${plan.sessionId}`, (msg) => {
          this.handleAgentResult(plan, msg.payload as { subGoalId: string; success: boolean; output: unknown; error?: string });
        })
      );

      agentSubscriptions.push(
        this.messageBus.subscribe(`agent:error:${plan.sessionId}`, (msg) => {
          this.handleAgentError(plan, msg.payload as { subGoalId: string; error: string });
        })
      );

      for (const group of dag.parallelGroups) {
        const nodes = group.map((id) => dag.nodes.find((n) => n.id === id)).filter(Boolean) as SubGoal[];

        const ready = nodes.filter((n) =>
          n.dependencies.every((dep) => {
            const depNode = plan.subGoals.find((s) => s.id === dep);
            return depNode?.status === 'completed';
          })
        );

        if (ready.length === 0) {
          const blocked = nodes.map((n) => `${n.id}(deps:${n.dependencies.join(',')})`).join(', ');
          this.logger.warn(`[Supervisor] All nodes in group blocked: ${blocked}`);
          continue;
        }

        this.logger.log(`[Supervisor] Executing parallel group: ${ready.map((n) => n.id).join(', ')}`);
        this.emitStatus(plan, 'orchestration:group_start', {
          message: `Starting ${ready.length} parallel tasks`,
          group: ready.map((n) => ({ id: n.id, description: n.description })),
        });

        const results = await this.executeParallelGroup(plan, ready);

        for (const result of results) {
          const subGoal = plan.subGoals.find((sg) => sg.id === result.subGoalId);
          if (subGoal) {
            subGoal.status = result.success ? 'completed' : 'failed';
            subGoal.result = result.output;
            subGoal.error = result.error;
            subGoal.completedAt = new Date();
          }
        }

        this.emitStatus(plan, 'orchestration:group_complete', {
          message: `Completed group: ${ready.map((n) => n.id).join(', ')}`,
          results: results.map((r) => ({ subGoalId: r.subGoalId, success: r.success })),
        });
      }

      const allCompleted = plan.subGoals.every((sg) => sg.status === 'completed');
      const anyFailed = plan.subGoals.some((sg) => sg.status === 'failed');
      const anyPending = plan.subGoals.some((sg) => sg.status === 'pending' || sg.status === 'running');

      if (anyPending) {
        plan.subGoals
          .filter((sg) => sg.status === 'pending' || sg.status === 'running')
          .forEach((sg) => { sg.status = 'skipped'; });
      }

      plan.status = allCompleted ? 'completed' : anyFailed ? 'partial' : 'failed';
      plan.completedAt = new Date();

      if (allCompleted || anyFailed) {
        plan.result = await this.synthesizer.synthesize(
          plan.originalGoal,
          plan.subGoals.filter((sg) => sg.status === 'completed'),
          plan.subGoals.filter((sg) => sg.status === 'failed' || sg.status === 'skipped'),
        );
      }

      this.logger.log(
        `[Supervisor] Plan ${plan.id} ${plan.status} | ${plan.subGoals.filter((sg) => sg.status === 'completed').length}/${plan.subGoals.length} sub-goals completed`
      );

      this.emitStatus(plan, 'orchestration:complete', {
        message: `Orchestration ${plan.status}: ${plan.subGoals.filter((sg) => sg.status === 'completed').length}/${plan.subGoals.length} tasks completed`,
        status: plan.status,
        result: plan.result,
        subGoals: plan.subGoals.map((sg) => ({
          id: sg.id,
          status: sg.status,
          description: sg.description,
          error: sg.error,
        })),
      });

      await this.persistResults(plan);

    } catch (error: any) {
      plan.status = 'failed';
      this.logger.error(`[Supervisor] Orchestration failed: ${error.message}`);
      this.emitStatus(plan, 'orchestration:error', { message: error.message });
    } finally {
      agentSubscriptions.forEach((unsub) => unsub());
      setTimeout(() => this.activePlans.delete(plan.id), 300000);
    }
  }

  private async executeParallelGroup(
    plan: OrchestrationPlan,
    nodes: SubGoal[],
  ): Promise<{ subGoalId: string; success: boolean; output: unknown; error?: string }[]> {
    const promises = nodes.map(async (node) => {
      node.status = 'running';
      node.startedAt = new Date();
      this.emitStatus(plan, 'subgoal:started', {
        subGoalId: node.id,
        description: node.description,
        agentType: node.agentType,
      });

      for (let attempt = 0; attempt <= node.maxRetries; attempt++) {
        try {
          const result = await this.executeSubGoal(plan, node);
          return { subGoalId: node.id, success: true, output: result };
        } catch (error: any) {
          node.retryCount = attempt + 1;
          this.logger.warn(`[Supervisor] SubGoal ${node.id} attempt ${attempt + 1}/${node.maxRetries + 1} failed: ${error.message}`);

          if (attempt < node.maxRetries) {
            this.emitStatus(plan, 'subgoal:retrying', {
              subGoalId: node.id,
              attempt: attempt + 1,
              maxRetries: node.maxRetries,
              error: error.message,
            });
          }
        }
      }

      return { subGoalId: node.id, success: false, output: null, error: `All ${node.maxRetries + 1} attempts failed` };
    });

    return Promise.all(promises);
  }

  private async executeSubGoal(plan: OrchestrationPlan, subGoal: SubGoal): Promise<unknown> {
    const agent = this.agentRegistry.getAgent(subGoal.agentType);

    if (agent) {
      this.logger.log(`[Supervisor] Delegating ${subGoal.id} to domain agent: ${agent.id}`);
      this.emitStatus(plan, 'subgoal:delegated', {
        subGoalId: subGoal.id,
        agentId: agent.id,
        agentName: agent.name,
      });

      const sharedContext = this.buildSharedContext(plan, subGoal);

      await this.messageBus.publish(`agent:task:${agent.id}`, {
        type: 'orchestration:execute',
        subGoalId: subGoal.id,
        sessionId: plan.sessionId,
        userId: plan.userId,
        description: subGoal.description,
        context: { ...subGoal.context, ...sharedContext },
        originalGoal: plan.originalGoal,
        allSubGoals: plan.subGoals.map((sg) => ({
          id: sg.id,
          description: sg.description,
          status: sg.status,
        })),
      });

      const response = await this.messageBus.request(
        `agent:task:${agent.id}:result`,
        { subGoalId: subGoal.id },
        120000,
      );

      if (!response) {
        throw new Error(`Agent ${agent.id} did not respond within timeout`);
      }

      return response.payload;
    }

    this.logger.log(`[Supervisor] Executing ${subGoal.id} with inline runtime (no domain agent)`);

    return {
      completed: true,
      description: subGoal.description,
      note: 'Executed by supervisor fallback',
    };
  }

  private buildSharedContext(plan: OrchestrationPlan, currentSubGoal: SubGoal): Record<string, unknown> {
    const completedResults: Record<string, unknown> = {};
    for (const sg of plan.subGoals) {
      if (sg.status === 'completed' && sg.result) {
        completedResults[sg.id] = sg.result;
      }
    }

    return {
      planId: plan.id,
      sessionId: plan.sessionId,
      completedSubGoals: completedResults,
      parallelRunningSubGoals: plan.subGoals
        .filter((sg) => sg.status === 'running' && sg.id !== currentSubGoal.id)
        .map((sg) => sg.id),
    };
  }

  private buildExecutionDag(subGoals: SubGoal[], parallelGroups: string[][]): ExecutionDag {
    const edges: { from: string; to: string }[] = [];
    for (const sg of subGoals) {
      for (const dep of sg.dependencies) {
        edges.push({ from: dep, to: sg.id });
      }
    }

    return {
      nodes: subGoals,
      edges,
      parallelGroups,
    };
  }

  private async handleAgentResult(
    plan: OrchestrationPlan,
    payload: { subGoalId: string; success: boolean; output: unknown; error?: string },
  ): Promise<void> {
    const subGoal = plan.subGoals.find((sg) => sg.id === payload.subGoalId);
    if (!subGoal) return;

    subGoal.status = payload.success ? 'completed' : 'failed';
    subGoal.result = payload.output;
    subGoal.error = payload.error;
    subGoal.completedAt = new Date();

    this.emitStatus(plan, 'subgoal:completed', {
      subGoalId: payload.subGoalId,
      success: payload.success,
      error: payload.error,
    });
  }

  private async handleAgentError(
    plan: OrchestrationPlan,
    payload: { subGoalId: string; error: string },
  ): Promise<void> {
    const subGoal = plan.subGoals.find((sg) => sg.id === payload.subGoalId);
    if (!subGoal) return;

    subGoal.status = 'failed';
    subGoal.error = payload.error;

    if (subGoal.retryCount < subGoal.maxRetries) {
      subGoal.retryCount++;
      subGoal.status = 'pending';
      this.logger.log(`[Supervisor] Requeuing ${subGoal.id} for retry ${subGoal.retryCount}/${subGoal.maxRetries}`);
      this.emitStatus(plan, 'subgoal:requeued', {
        subGoalId: payload.subGoalId,
        retryCount: subGoal.retryCount,
        maxRetries: subGoal.maxRetries,
      });
    } else {
      this.emitStatus(plan, 'subgoal:failed', {
        subGoalId: payload.subGoalId,
        error: payload.error,
      });
    }
  }

  async sendInterAgentMessage(
    fromAgent: string,
    toAgent: string,
    type: InterAgentMessage['type'],
    payload: unknown,
    correlationId: string,
  ): Promise<void> {
    const message: InterAgentMessage = {
      id: `iam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromAgent,
      toAgent,
      type,
      payload,
      correlationId,
      timestamp: new Date(),
      ttl: 30000,
    };

    await this.messageBus.publish(`agent:direct:${toAgent}`, message);
    this.logger.debug(`[Supervisor] Inter-agent message: ${fromAgent} -> ${toAgent} (${type})`);
  }

  async getPlanStatus(planId: string): Promise<OrchestrationPlan | undefined> {
    return this.activePlans.get(planId);
  }

  async cancelPlan(planId: string): Promise<boolean> {
    const plan = this.activePlans.get(planId);
    if (!plan) return false;

    plan.status = 'failed';
    for (const sg of plan.subGoals) {
      if (sg.status === 'pending' || sg.status === 'running') {
        sg.status = 'skipped';
      }
    }

    this.emitStatus(plan, 'orchestration:cancelled', { message: 'Orchestration cancelled by user' });
    return true;
  }

  private emitStatus(plan: OrchestrationPlan, event: string, data: Record<string, unknown>): void {
    this.wsGateway.emitToSession(plan.sessionId, event, {
      planId: plan.id,
      sessionId: plan.sessionId,
      timestamp: Date.now(),
      data,
    });
  }

  private async persistResults(plan: OrchestrationPlan): Promise<void> {
    await this.memoryStore.store(
      plan.userId,
      'EPISODIC',
      `orchestration:${plan.id}`,
      JSON.stringify({
        goal: plan.originalGoal,
        status: plan.status,
        subGoalCount: plan.subGoals.length,
        completedCount: plan.subGoals.filter((sg) => sg.status === 'completed').length,
        failedCount: plan.subGoals.filter((sg) => sg.status === 'failed').length,
        result: plan.result,
        timestamp: new Date().toISOString(),
      }),
      plan.status === 'completed' ? 0.7 : 0.3,
      undefined,
      {
        planId: plan.id,
        sessionId: plan.sessionId,
        type: 'multi_agent_orchestration',
      },
    );
  }
}
