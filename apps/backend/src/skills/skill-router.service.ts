// apps/backend/src/skills/skill-router.service.ts
//
// SkillRouter — the dispatcher between Planner and Domain Skills.
//
// Flow:
//   ParsedGoal
//       ↓
//   SkillRouter.route(goal)
//       ↓
//   Iterates registered skills in priority order
//       ↓
//   First skill.canHandle(goal) === true wins
//       ↓
//   Returns { skill, plan }
//       ↓
//   ExecutionEngine uses the plan
//
// Falls back to the generic Planner if no skill matches.

import { Injectable, Logger } from '@nestjs/common';
import { ParsedGoal } from '../agent/goal-understanding.service';
import { DomainSkill } from './skill.interface';
import { AgentPlan } from '../shared/interfaces/agent.interfaces';

// Job skills
import { LinkedInSkill } from './job/linkedin.skill';
import { NaukriSkill } from './job/naukri.skill';
import { IndeedSkill } from './job/indeed.skill';
import { WellfoundSkill } from './job/wellfound.skill';

// Food skills
import { ZomatoSkill } from './food/zomato.skill';
import { SwiggySkill } from './food/swiggy.skill';

// Shopping skills
import { AmazonSkill } from './shopping/amazon.skill';
import { FlipkartSkill } from './shopping/flipkart.skill';

export interface SkillRouterResult {
  matched: true;
  skill: DomainSkill;
  plan: AgentPlan;
  category: string;
}

export interface SkillRouterMiss {
  matched: false;
}

export type SkillRouteDecision = SkillRouterResult | SkillRouterMiss;

export interface SkillBranchResult {
  branchId: string;
  skillName: string;
  skill: DomainSkill;
  plan: AgentPlan;
}

@Injectable()
export class SkillRouterService {
  private readonly logger = new Logger(SkillRouterService.name);

  /**
   * Skills are evaluated in this order — more specific skills first.
   * If multiple skills can handle the same goal, the first one wins.
   */
  private readonly skills: DomainSkill[] = [
    // Job
    new LinkedInSkill(),
    new NaukriSkill(),
    new IndeedSkill(),
    new WellfoundSkill(),
    // Food
    new ZomatoSkill(),
    new SwiggySkill(),
    // Shopping
    new AmazonSkill(),
    new FlipkartSkill(),
  ];

  /**
   * Routes a parsed goal to the most appropriate domain skill.
   * Returns the matched skill and its generated plan, or `matched: false`.
   */
  route(goal: ParsedGoal): SkillRouteDecision {
    for (const skill of this.skills) {
      if (skill.canHandle(goal)) {
        this.logger.log(
          `[SkillRouter] Goal "${goal.intent.slice(0, 60)}..." → matched skill: "${skill.name}" (${skill.category})`,
        );

        const rawPlan = skill.buildPlan(goal);
        const plan = this.normalizePlan(rawPlan, goal, skill);

        return {
          matched: true,
          skill,
          plan,
          category: skill.category,
        };
      }
    }

    this.logger.log(
      `[SkillRouter] No skill matched for taskType="${goal.taskType}". Falling back to generic Planner.`,
    );

    return { matched: false };
  }

  /**
   * Returns all skills in a domain category for parallel execution
   * (e.g. LinkedIn + Indeed + Naukri for generic job search).
   */
  routeAll(goal: ParsedGoal, domain: string): SkillBranchResult[] {
    const categorySkills = this.skills.filter((s) => s.category === domain);
    if (categorySkills.length === 0) return [];

    const siteSpecific = categorySkills.filter((s) => s.canHandle(goal));
    const skillsToUse =
      siteSpecific.length > 0 && (goal.preferredWebsites?.length ?? 0) > 0
        ? siteSpecific
        : categorySkills;

    this.logger.log(
      `[SkillRouter] routeAll domain="${domain}" → ${skillsToUse.length} branch(es): ${skillsToUse.map((s) => s.name).join(', ')}`,
    );

    return skillsToUse.map((skill) => {
      const rawPlan = skill.buildPlan(goal);
      const plan = this.normalizePlan(rawPlan, goal, skill);
      return {
        branchId: skill.name,
        skillName: skill.name,
        skill,
        plan,
      };
    });
  }

  /** Public normalizer for Plugin Registry → Agent Registry pipeline */
  normalizePluginPlan(
    rawPlan: any,
    goal: ParsedGoal,
    pluginId: string,
    category: string,
  ): AgentPlan {
    return this.normalizePlan(rawPlan, goal, {
      name: pluginId,
      category,
      supportedDomains: [],
      canHandle: () => true,
      buildPlan: () => rawPlan,
    } as DomainSkill);
  }

  private normalizePlan(rawPlan: any, goal: ParsedGoal, skill: DomainSkill): AgentPlan {
    const rawSteps = rawPlan.steps || [];
    const steps = rawSteps.map((step: any, i: number) => {
      // Map action to a valid BrowserAction
      let action = step.action || 'wait';
      if (action === 'fillForm') {
        action = 'type';
      } else if (action === 'keyPress') {
        action = 'press_key';
      }

      // Map waitCondition
      let waitCondition = undefined;
      if (step.waitCondition) {
        let waitType: any = step.waitCondition.type;
        if (waitType === 'networkIdle') waitType = 'network_idle';
        if (waitType === 'visible' || waitType === 'domElement') waitType = 'selector';
        if (waitType === 'delay') waitType = 'timeout';

        waitCondition = {
          type: waitType || 'network_idle',
          value: String(step.waitCondition.value ?? ''),
          timeoutMs: Number(step.waitCondition.timeoutMs ?? step.waitCondition.value ?? 10000),
        };
      }

      // Map fallback if present
      let fallback = undefined;
      if (step.fallback) {
        let fallbackAction = step.fallback.action || 'screenshot';
        if (fallbackAction === 'keyPress') fallbackAction = 'press_key';
        fallback = {
          index: step.index ?? i,
          action: fallbackAction,
          target: step.fallback.target || undefined,
          value: step.fallback.value || undefined,
          description: step.fallback.description || 'Fallback step',
          riskLevel: step.fallback.riskLevel || 'LOW',
          requiresApproval: step.fallback.requiresApproval || false,
        };
      }

      return {
        index: step.index ?? i,
        action,
        target: step.target || undefined,
        value: step.value || undefined,
        description: step.description || `Step ${i}`,
        riskLevel: step.riskLevel || (step.requiresApproval ? 'HIGH' : 'LOW'),
        requiresApproval: step.requiresApproval || false,
        skillName: step.skillName || undefined,
        fallback,
        waitCondition,
        validation: step.validation || undefined,
      };
    });

    const riskAssessment = rawPlan.riskAssessment || {
      overallRisk: steps.some((s: any) => s.riskLevel === 'CRITICAL')
        ? 'CRITICAL'
        : steps.some((s: any) => s.riskLevel === 'HIGH')
        ? 'HIGH'
        : 'LOW',
      reasons: ['Domain-specific predefined plan'],
      requiresUserApproval: steps.some((s: any) => s.requiresApproval),
    };

    return {
      taskId: rawPlan.taskId || '',
      goal: rawPlan.goal || goal.intent || 'Execution plan',
      steps,
      estimatedDuration: rawPlan.estimatedDuration || 120,
      riskAssessment,
      skillsUsed: rawPlan.skillsUsed || [this.getSkillNameFromCategory(skill.category)],
      metadata: rawPlan.metadata || {},
    };
  }

  private getSkillNameFromCategory(category: string): string {
    if (category === 'job') return 'FormFillSkill';
    if (category === 'food') return 'PurchaseSkill';
    if (category === 'shopping') return 'PurchaseSkill';
    return 'NavigationSkill';
  }

  /**
   * Returns a list of all registered skills and their metadata.
   * Used by the /agent/skills endpoint.
   */
  listSkills() {
    return this.skills.map((s) => ({
      name: s.name,
      category: s.category,
      supportedDomains: s.supportedDomains,
    }));
  }
}
