import { api } from './api';

export interface OrchestratorStep {
  index: number;
  action: string;
  description: string;
  requiresApproval: boolean;
  expectedOutcome: string;
}

export interface OrchestratorPlan {
  goal: string;
  taskType: string;
  integration: string;
  requiredCredentials: string[];
  steps: OrchestratorStep[];
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  requiresUserInput: boolean;
  userQuestions: string[];
}

export async function processTask(goal: string): Promise<OrchestratorPlan> {
  const { data } = await api.post('/agent/orchestrate', { goal });
  return data;
}

export async function executePlan(
  taskId: string,
  plan: OrchestratorPlan,
  config?: any,
): Promise<{ sessionId: string }> {
  const { data } = await api.post('/agent/execute', {
    taskId,
    goal: plan.goal,
    config,
  });
  return data;
}
