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
export class FinanceDomainAgent extends BaseDomainAgent {
  readonly id = 'finance-agent';
  readonly name = 'Finance Agent';
  readonly category = 'general' as const;
  readonly description = 'Expense tracking, financial analysis, budget management, and spending insights';
  readonly taskTypes = ['expense_tracking', 'financial_report', 'budget_management', 'spending_analysis', 'finance'];

  constructor(
    pluginRegistry: PluginRegistryService,
    graphService: ExecutionGraphService,
    skillRouter: SkillRouterService,
  ) {
    super(pluginRegistry, graphService, skillRouter);
  }

  async buildGraph(goal: ParsedGoal, context: DomainAgentBuildContext): Promise<DomainAgentGraphResult> {
    const plan = this.generateFinancePlan(goal, context);
    const graph = this.graphService.graphFromLinearPlan(context.goalText, this.category, plan);
    return { graph, plan, pluginIds: [], parallel: false };
  }

  private generateFinancePlan(goal: ParsedGoal, context: DomainAgentBuildContext): AgentPlan {
    const type = this.detectFinanceType(context.goalText);

    return {
      taskId: `finance-${Date.now()}`,
      goal: context.goalText,
      steps: [
        { index: 0, action: 'extract_data' as const, description: `Fetch financial data for ${type}`, riskLevel: 'LOW' as const, requiresApproval: false, expectedOutcome: 'Financial data loaded' },
        { index: 1, action: 'extract_data' as const, description: `Categorize and analyze ${type}`, riskLevel: 'LOW' as const, requiresApproval: false, expectedOutcome: 'Analysis complete' },
        { index: 2, action: 'click' as const, description: `Generate ${type} report`, riskLevel: 'MEDIUM' as const, requiresApproval: true, expectedOutcome: 'Report generated' },
      ],
      estimatedDuration: 60,
      riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: false },
    };
  }

  private detectFinanceType(goal: string): string {
    const g = goal.toLowerCase();
    if (/\b(expense|spend|cost|payment)\b/.test(g)) return 'expense_analysis';
    if (/\b(budget|plan|allocate)\b/.test(g)) return 'budget_planning';
    if (/\b(report|summary|overview|dashboard)\b/.test(g)) return 'financial_summary';
    if (/\b(save|saving|invest|investment|goal)\b/.test(g)) return 'savings_goals';
    if (/\b(track|categorize|organize)\b/.test(g)) return 'expense_tracking';
    return 'financial_summary';
  }
}
