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
export class FileDomainAgent extends BaseDomainAgent {
  readonly id = 'file-agent';
  readonly name = 'File Agent';
  readonly category = 'general' as const;
  readonly description = 'Document creation, file management, content generation, and information organization';
  readonly taskTypes = ['file_create', 'file_search', 'file_organize', 'document_generation', 'content_creation'];

  constructor(
    pluginRegistry: PluginRegistryService,
    graphService: ExecutionGraphService,
    skillRouter: SkillRouterService,
  ) {
    super(pluginRegistry, graphService, skillRouter);
  }

  async buildGraph(goal: ParsedGoal, context: DomainAgentBuildContext): Promise<DomainAgentGraphResult> {
    const plan = this.generateFilePlan(goal, context);
    const graph = this.graphService.graphFromLinearPlan(context.goalText, this.category, plan);
    return { graph, plan, pluginIds: [], parallel: false };
  }

  private generateFilePlan(goal: ParsedGoal, context: DomainAgentBuildContext): AgentPlan {
    const type = this.detectFileType(context.goalText);

    return {
      taskId: `file-${Date.now()}`,
      goal: context.goalText,
      steps: [
        { index: 0, action: 'navigate' as const, description: `Identify context and requirements for ${type}`, riskLevel: 'LOW' as const, requiresApproval: false, expectedOutcome: 'Requirements identified' },
        { index: 1, action: 'type' as const, description: `Generate ${type} document content`, riskLevel: 'LOW' as const, requiresApproval: false, expectedOutcome: 'Content generated' },
        { index: 2, action: 'click' as const, description: 'Save document to storage', riskLevel: 'MEDIUM' as const, requiresApproval: true, expectedOutcome: 'Document saved' },
      ],
      estimatedDuration: 45,
      riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: false },
    };
  }

  private detectFileType(goal: string): string {
    const g = goal.toLowerCase();
    if (/\b(report|analysis|research|summary|documentation)\b/.test(g)) return 'report';
    if (/\b(email|mail|message|letter)\b/.test(g)) return 'email';
    if (/\b(proposal|plan|strategy|roadmap)\b/.test(g)) return 'proposal';
    if (/\b(note|memo|minutes|agenda)\b/.test(g)) return 'note';
    if (/\b(resume|cv|bio|profile)\b/.test(g)) return 'resume';
    if (/\b(article|blog|post|content)\b/.test(g)) return 'article';
    return 'summary';
  }
}
