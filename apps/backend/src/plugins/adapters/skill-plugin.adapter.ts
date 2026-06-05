import { ParsedGoal } from '../../agent/goal-understanding.service';
import { AgentPlan } from '../../shared/interfaces/agent.interfaces';
import { DomainSkill } from '../../skills/skill.interface';
import { SitePlugin } from '../plugin.interface';

/**
 * Bridges legacy DomainSkill modules into the Plugin system
 * without rewriting every skill file.
 */
export class SkillPluginAdapter implements SitePlugin {
  readonly version = '1.0.0';

  constructor(private readonly skill: DomainSkill) {}

  get id(): string {
    return this.skill.name;
  }

  get name(): string {
    return this.skill.name;
  }

  get category(): string {
    return this.skill.category;
  }

  get supportedDomains(): string[] {
    return this.skill.supportedDomains;
  }

  canHandle(goal: ParsedGoal): boolean {
    return this.skill.canHandle(goal);
  }

  buildPlan(goal: ParsedGoal): AgentPlan {
    return this.skill.buildPlan(goal) as AgentPlan;
  }
}
