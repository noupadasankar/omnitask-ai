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
export class EmailDomainAgent extends BaseDomainAgent {
  readonly id = 'email-agent';
  readonly name = 'Communication Agent';
  readonly category = 'email' as const;
  readonly description = 'Read, send, and manage emails, notifications, and messages across Gmail, Outlook, and IMAP';
  readonly taskTypes = ['email_send', 'email_read', 'email_search', 'email_reply', 'email_manage', 'communication', 'notification'];

  constructor(
    pluginRegistry: PluginRegistryService,
    graphService: ExecutionGraphService,
    skillRouter: SkillRouterService,
  ) {
    super(pluginRegistry, graphService, skillRouter);
  }

  async buildGraph(goal: ParsedGoal, context: DomainAgentBuildContext): Promise<DomainAgentGraphResult> {
    const plan = this.generateCommunicationPlan(context.goalText);
    const graph = this.graphService.graphFromLinearPlan(context.goalText, this.category, plan);
    return { graph, plan, pluginIds: [], parallel: false };
  }

  private generateCommunicationPlan(goal: string): AgentPlan {
    const type = this.detectCommunicationType(goal);

    return {
      taskId: `comm-${Date.now()}`,
      goal,
      steps: [
        { index: 0, action: 'navigate' as const, description: `Identify recipients and context for ${type}`, riskLevel: 'LOW' as const, requiresApproval: false, expectedOutcome: 'Context gathered' },
        { index: 1, action: 'type' as const, description: `Generate ${type} content`, riskLevel: 'LOW' as const, requiresApproval: false, expectedOutcome: 'Content drafted' },
        { index: 2, action: 'click' as const, description: `Send ${type}`, riskLevel: 'MEDIUM' as const, requiresApproval: true, expectedOutcome: 'Communication sent' },
      ],
      estimatedDuration: 30,
      riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: true },
    };
  }

  private detectCommunicationType(goal: string): string {
    const g = goal.toLowerCase();
    if (/\b(send|compose|draft|write|reply|respond)\b/.test(g)) return 'compose';
    if (/\b(read|check|inbox|unread|recent)\b/.test(g)) return 'read';
    if (/\b(search|find|lookup|hunt)\b/.test(g)) return 'search';
    if (/\b(organize|folder|label|archive|clean|categorize)\b/.test(g)) return 'manage';
    if (/\b(newsletter|campaign|broadcast|bulk)\b/.test(g)) return 'campaign';
    return 'compose';
  }
}
