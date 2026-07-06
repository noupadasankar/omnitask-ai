import { ParsedGoal } from '../../agent/goal-understanding.service';
import { PluginRegistryService } from '../../plugins/plugin-registry.service';
import { ExecutionGraphService } from '../../agent/runtime/execution-graph.service';
import { SkillRouterService } from '../../skills/skill-router.service';
import {
  DomainAgent,
  DomainAgentBuildContext,
  DomainAgentCategory,
  DomainAgentGraphResult,
} from '../domain-agent.interface';

const PARALLEL_TASK_TYPES = new Set([
  'job_search',
  'food_order',
  'shopping',
  'price_comparison',
]);

export abstract class BaseDomainAgent implements DomainAgent {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly category: DomainAgentCategory;
  abstract readonly description: string;
  abstract readonly taskTypes: string[];

  constructor(
    protected pluginRegistry: PluginRegistryService,
    protected graphService: ExecutionGraphService,
    protected skillRouter: SkillRouterService,
  ) {}

  canHandle(goal: ParsedGoal): boolean {
    return this.taskTypes.includes(goal.taskType);
  }

  async buildGraph(
    goal: ParsedGoal,
    context: DomainAgentBuildContext,
  ): Promise<DomainAgentGraphResult> {
    const parallel = this.shouldRunParallel(goal, context);
    const plugins = this.pluginRegistry.resolvePlugins(
      goal,
      this.category,
      parallel,
      context.preferredSites,
    );

    const branches = plugins.map((plugin) => {
      const rawPlan = plugin.buildPlan(goal);
      const normalized = this.skillRouter.normalizePluginPlan(
        rawPlan,
        goal,
        plugin.id,
        plugin.category,
      );

      return {
        branchId: plugin.id,
        skillName: plugin.id,
        plan: normalized,
      };
    });

    const merged = this.graphService.mergeBranchPlans(
      context.goalText,
      this.category,
      branches,
    );

    return {
      graph: merged.graph,
      plan: merged.plan,
      pluginIds: plugins.map((plugin) => plugin.id),
      parallel: plugins.length > 1,
    };
  }

  protected shouldRunParallel(
    goal: ParsedGoal,
    context?: DomainAgentBuildContext,
  ): boolean {
    if (!PARALLEL_TASK_TYPES.has(goal.taskType)) return false;

    if ((goal.preferredWebsites?.length ?? 0) > 1) return true;
    if ((goal.preferredWebsites?.length ?? 0) === 1) return false;

    const preferred = context?.preferredSites || [];
    if (preferred.length > 1) return true;
    if (preferred.length === 1) return false;

    const intent = goal.intent.toLowerCase();
    const siteKeywords = [
      'linkedin',
      'indeed',
      'naukri',
      'wellfound',
      'swiggy',
      'zomato',
      'amazon',
      'flipkart',
    ];
    const mentionedSites = siteKeywords.filter((keyword) =>
      intent.includes(keyword),
    );

    if (mentionedSites.length > 1) return true;
    if (mentionedSites.length === 1) return false;

    return true;
  }
}
