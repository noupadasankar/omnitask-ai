import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { BrowserSessionConfig, ExecutionEventType } from '../../shared/interfaces/agent.interfaces';
import { AgentGateway } from '../../websocket/agent.gateway';
import { formatPluginLabel } from '../../memory/preferences/preference-memory.service';
import { ParsedGoal } from '../goal-understanding.service';
import { AgentRouterResult, AgentRouterService } from '../agent-router.service';
import { StrategyMemoryService } from '../strategy-memory.service';

@Injectable()
export class PlanOrchestratorService {
  private readonly logger = new Logger(PlanOrchestratorService.name);

  constructor(
    private agentRouter: AgentRouterService,
    private strategyMemory: StrategyMemoryService,
    @Inject(forwardRef(() => AgentGateway))
    private wsGateway: AgentGateway,
  ) {}

  async buildExecutionPlan(
    sessionId: string,
    userId: string,
    taskId: string,
    goal: string,
    parsedGoal: ParsedGoal | undefined,
    config?: Partial<BrowserSessionConfig>,
  ): Promise<AgentRouterResult & { strategyHints: string }> {
    let strategyHints = '';

    if (parsedGoal) {
      const strategies = await this.strategyMemory.recallStrategies(
        userId,
        parsedGoal,
      );
      strategyHints = this.strategyMemory.formatStrategiesForPlanner(strategies);

      if (strategies.length > 0) {
        this.wsGateway.emitToSession(sessionId, 'execution:event', {
          type: 'log:info' as ExecutionEventType,
          data: {
            source: 'StrategyMemory',
            message: `Recalled ${strategies.length} strategy pattern(s) from past runs`,
            strategies: strategies.map((strategy) => ({
              approach: strategy.pattern.effectiveApproach,
              relevance: strategy.relevanceScore,
            })),
          },
        });
      }
    }

    this.wsGateway.emitToSession(sessionId, 'execution:event', {
      type: 'plan:creating' as ExecutionEventType,
      data: { goal },
    });

    const domain = parsedGoal
      ? this.agentRouter.inferDomain(parsedGoal)
      : 'general';

    this.wsGateway.emitToSession(sessionId, 'agent:domain_routed', {
      sessionId,
      domain,
      taskType: parsedGoal?.taskType || 'general',
    });

    const routed = await this.agentRouter.route(
      parsedGoal || {
        taskType: 'general',
        intent: goal,
        entities: {},
        constraints: [],
        preferredWebsites: [],
        estimatedComplexity: 'moderate',
        requiresPayment: false,
        requiresLogin: false,
        sensitiveData: false,
        ambiguityScore: 0,
        clarifyingQuestions: [],
        confidence: 0.8,
      },
      {
        goal,
        userId,
        sessionId,
        strategyHints,
        userPreferences: config as Record<string, any>,
      },
    );

    routed.merged.plan.taskId = taskId;

    const routingPreferences =
      routed.preferredSitesApplied?.map(formatPluginLabel) ||
      (routed.appliedPreferences
        ? this.agentRouter.formatPreferenceSummary(
            routed.appliedPreferences,
            routed.domain,
          )
        : []);

    if (routingPreferences.length > 0) {
      this.wsGateway.emitToSession(sessionId, 'memory:preferences_applied', {
        sessionId,
        domain: routed.domain,
        preferences: routed.appliedPreferences,
        activeForDomain: routingPreferences,
        message: `Routing prefers: ${routingPreferences.join(', ')}`,
      });

      this.wsGateway.emitToSession(sessionId, 'execution:event', {
        type: 'log:info' as ExecutionEventType,
        data: {
          source: 'PreferenceMemory',
          message: `Learned preferences applied - ${routingPreferences.join(', ')} prioritized`,
        },
      });
    }

    const sourceLabel =
      routed.source === 'agent_registry'
        ? `${routed.agentId || routed.domain} agent -> plugins: ${routed.matchedSkills.join(', ')}`
        : 'Universal Planner';

    this.wsGateway.emitToSession(sessionId, 'execution:event', {
      type: 'log:info' as ExecutionEventType,
      data: {
        source: 'AgentRegistry',
        message: `${sourceLabel} -> ${routed.merged.plan.steps.length} steps (${routed.merged.graph.parallelBranches.length} parallel branch(es))`,
      },
    });

    this.wsGateway.emitToSession(sessionId, 'agent:registry_routed', {
      sessionId,
      agentId: routed.agentId,
      domain: routed.domain,
      plugins: routed.matchedSkills,
      parallel: routed.merged.graph.parallelBranches.length > 1,
    });

    this.wsGateway.emitToSession(sessionId, 'execution:graph', {
      sessionId,
      graph: routed.merged.graph,
      domain: routed.domain,
      matchedSkills: routed.matchedSkills,
      agentId: routed.agentId,
    });

    return { ...routed, strategyHints };
  }
}
