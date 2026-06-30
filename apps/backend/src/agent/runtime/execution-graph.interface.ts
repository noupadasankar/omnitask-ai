import { AgentPlan, PlannedStep } from '../../shared/interfaces/agent.interfaces';

export interface ExecutionNode {
  id: string;
  action: string;
  description: string;
  dependencies: string[];
  branchId?: string;
  skillName?: string;
  step?: PlannedStep;
}

export interface ExecutionGraph {
  goal: string;
  domain: string;
  nodes: ExecutionNode[];
  /** Branch IDs that can run in parallel (future worker cluster support) */
  parallelBranches: string[];
}

export interface MergedExecutionPlan {
  plan: AgentPlan;
  graph: ExecutionGraph;
}
