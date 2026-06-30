import { AgentPlan } from '../../shared/interfaces/agent.interfaces';

export type SubGoalStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface SubGoal {
  id: string;
  description: string;
  agentType: string;
  priority: number;
  dependencies: string[];
  context: Record<string, unknown>;
  status: SubGoalStatus;
  result?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  maxRetries: number;
}

export interface OrchestrationPlan {
  id: string;
  sessionId: string;
  userId: string;
  originalGoal: string;
  subGoals: SubGoal[];
  status: 'building' | 'ready' | 'running' | 'completed' | 'partial' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  result?: SynthesizedResult;
  metadata: Record<string, unknown>;
}

export interface SynthesizedResult {
  summary: string;
  confidence: number;
  data: Record<string, unknown>;
  artifacts: ArtifactReference[];
  warnings: string[];
  gaps: string[];
}

export interface ArtifactReference {
  id: string;
  type: string;
  description: string;
  agentSource: string;
  url?: string;
}

export interface AgentCapability {
  agentType: string;
  name: string;
  description: string;
  taskTypes: string[];
  maxConcurrency: number;
}

export interface SubGoalDecomposition {
  subGoals: SubGoal[];
  reasoning: string;
  parallelGroups: string[][];
  estimatedTotalComplexity: 'simple' | 'moderate' | 'complex' | 'very_complex';
}

export interface InterAgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: 'request' | 'response' | 'update' | 'error' | 'status';
  payload: unknown;
  correlationId: string;
  timestamp: Date;
  ttl: number;
}

export interface ExecutionDag {
  nodes: SubGoal[];
  edges: { from: string; to: string; condition?: string }[];
  parallelGroups: string[][];
}
