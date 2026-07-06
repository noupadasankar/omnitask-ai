import { Injectable } from '@nestjs/common';
import { ParsedGoal } from '../../agent/goal-understanding.service';
import { PluginRegistryService } from '../../plugins/plugin-registry.service';
import { ExecutionGraphService } from '../../agent/runtime/execution-graph.service';
import { SkillRouterService } from '../../skills/skill-router.service';
import {
  DomainAgentBuildContext,
  DomainAgentGraphResult,
} from '../domain-agent.interface';
import { AgentPlan } from '../../shared/interfaces/agent.interfaces';
import { BaseDomainAgent } from './base-domain.agent';

@Injectable()
export class CalendarDomainAgent extends BaseDomainAgent {
  readonly id = 'calendar-agent';
  readonly name = 'Calendar Agent';
  readonly category = 'general' as const;
  readonly description =
    'Manages calendar events: creates meetings, detects conflicts, finds free slots, and reschedules with travel buffers';
  readonly taskTypes = [
    'create_event',
    'find_slot',
    'detect_conflict',
    'reschedule',
    'calendar_sync',
  ];

  constructor(
    pluginRegistry: PluginRegistryService,
    graphService: ExecutionGraphService,
    skillRouter: SkillRouterService,
  ) {
    super(pluginRegistry, graphService, skillRouter);
  }

  async buildGraph(
    goal: ParsedGoal,
    context: DomainAgentBuildContext,
  ): Promise<DomainAgentGraphResult> {
    const plan = this.generateCalendarPlan(goal, context);
    const graph = this.graphService.graphFromLinearPlan(
      context.goalText,
      this.category,
      plan,
    );
    return { graph, plan, pluginIds: [], parallel: false };
  }

  private generateCalendarPlan(
    goal: ParsedGoal,
    context: DomainAgentBuildContext,
  ): AgentPlan {
    const action = this.detectCalendarAction(context.goalText);

    const steps = [
      {
        index: 0,
        action: 'navigate' as const,
        value: context.goalText,
        description: `Open calendar application to ${action}`,
        riskLevel: 'LOW' as const,
        requiresApproval: false,
        expectedOutcome: 'Calendar loaded and current view visible',
      },
      {
        index: 1,
        action: 'extract_data' as const,
        description: 'Read existing events, check availability, and identify conflicts',
        riskLevel: 'LOW' as const,
        requiresApproval: false,
        expectedOutcome: 'Free slots and conflicts identified',
      },
      {
        index: 2,
        action: 'click' as const,
        description: `Execute calendar action: ${action}`,
        riskLevel: 'MEDIUM' as const,
        requiresApproval: true,
        expectedOutcome: 'Calendar updated successfully',
      },
    ];

    return {
      taskId: `calendar-${Date.now()}`,
      goal: context.goalText,
      steps,
      estimatedDuration: 60,
      riskAssessment: {
        overallRisk: 'MEDIUM' as const,
        reasons: [`${action} modifies calendar data`],
        requiresUserApproval: true,
      },
    };
  }

  private detectCalendarAction(goal: string): string {
    const g = goal.toLowerCase();
    if (/\b(reschedule|move|postpone|delay)\b/.test(g)) return 'reschedule event';
    if (/\b(conflict|clash|overlap|double.book)\b/.test(g)) return 'detect conflicts';
    if (/\b(free|available|slot|when|open)\b/.test(g)) return 'find free slot';
    if (/\b(cancel|delete|remove)\b/.test(g)) return 'cancel event';
    return 'create event';
  }
}
