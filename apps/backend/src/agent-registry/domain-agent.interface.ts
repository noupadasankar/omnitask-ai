import { ParsedGoal } from '../agent/goal-understanding.service';
import { AgentPlan } from '../shared/interfaces/agent.interfaces';
import { ExecutionGraph } from '../agent/runtime/execution-graph.interface';
import { UserDomainPreferences } from '../memory/preferences/preference-memory.service';

export type DomainAgentCategory =
  | 'job'
  | 'food'
  | 'shopping'
  | 'travel'
  | 'research'
  | 'social'
  | 'email'
  | 'media'
  | 'music'
  | 'general';

export interface DomainAgentBuildContext {
  goalText: string;
  userId: string;
  userPreferences?: UserDomainPreferences;
  preferredSites?: string[];
}

export interface DomainAgentGraphResult {
  graph: ExecutionGraph;
  plan: AgentPlan;
  pluginIds: string[];
  parallel: boolean;
}

/**
 * Domain Agent — orchestrates multiple site plugins within one domain.
 * Job Agent → LinkedIn + Indeed + Naukri plugins
 * Food Agent → Swiggy + Zomato plugins
 */
export interface DomainAgent {
  readonly id: string;
  readonly name: string;
  readonly category: DomainAgentCategory;
  readonly description: string;

  /** Task types this agent handles, e.g. ['job_search'] */
  readonly taskTypes: string[];

  canHandle(goal: ParsedGoal): boolean;

  /** Build execution graph from registered plugins */
  buildGraph(
    goal: ParsedGoal,
    context: DomainAgentBuildContext,
  ): Promise<DomainAgentGraphResult>;
}

export interface DomainAgentMetadata {
  id: string;
  name: string;
  category: DomainAgentCategory;
  description: string;
  taskTypes: string[];
  pluginCount: number;
  plugins: string[];
}
