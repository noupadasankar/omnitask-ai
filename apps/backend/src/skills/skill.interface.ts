// apps/backend/src/skills/skill.interface.ts
//
// Domain Skill interface — every skill module implements this.
// The SkillRouter iterates registered skills and routes goals to the first match.

import { ParsedGoal } from '../agent/goal-understanding.service';
import { AgentPlan } from '../shared/interfaces/agent.interfaces';

export interface SkillResult {
  success: boolean;
  output?: any;
  error?: string;
  screenshot?: string;
  durationMs?: number;
}

export interface DomainSkill {
  /** Unique skill identifier, e.g. 'linkedin-apply' */
  readonly name: string;

  /** Human-readable category, e.g. 'job', 'food', 'shopping' */
  readonly category: string;

  /** List of site domains this skill covers */
  readonly supportedDomains: string[];

  /**
   * Returns true if this skill can handle the given parsed goal.
   * The SkillRouter calls this in registration order and uses the first match.
   */
  canHandle(goal: ParsedGoal): boolean;

  /**
   * Builds a concrete AgentPlan for this goal.
   * The plan is then handed to the ExecutionEngine / Worker.
   */
  buildPlan(goal: ParsedGoal): AgentPlan;
}
