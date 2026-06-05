import { Injectable } from '@nestjs/common';
import { AgentPlan, PlannedStep } from '../../shared/interfaces/agent.interfaces';
import { ExecutionGraph, ExecutionNode, MergedExecutionPlan } from './execution-graph.interface';

export interface BranchPlan {
  branchId: string;
  skillName: string;
  plan: AgentPlan;
}

@Injectable()
export class ExecutionGraphService {
  /**
   * Merges one or more branch plans into a linear step list for the worker
   * while preserving graph structure for the frontend execution visualizer.
   */
  mergeBranchPlans(
    goal: string,
    domain: string,
    branches: BranchPlan[],
  ): MergedExecutionPlan {
    const nodes: ExecutionNode[] = [];
    const parallelBranches = branches.length > 1 ? branches.map((b) => b.branchId) : [];
    const mergedSteps: PlannedStep[] = [];
    let globalIndex = 0;
    let lastMergeNodeId: string | null = null;

    for (const branch of branches) {
      const branchEntryId = `branch_${branch.branchId}_start`;
      nodes.push({
        id: branchEntryId,
        action: 'branch_start',
        description: `Start ${branch.skillName} branch`,
        dependencies: lastMergeNodeId ? [lastMergeNodeId] : [],
        branchId: branch.branchId,
        skillName: branch.skillName,
      });

      let prevNodeId = branchEntryId;

      for (const step of branch.plan.steps) {
        const nodeId = `node_${branch.branchId}_${step.index}`;
        const mergedStep: PlannedStep = {
          ...step,
          index: globalIndex,
          description: branches.length > 1
            ? `[${branch.skillName}] ${step.description}`
            : step.description,
          skillName: step.skillName || branch.skillName,
        };

        nodes.push({
          id: nodeId,
          action: step.action,
          description: mergedStep.description,
          dependencies: [prevNodeId],
          branchId: branch.branchId,
          skillName: branch.skillName,
          step: mergedStep,
        });

        mergedSteps.push(mergedStep);
        prevNodeId = nodeId;
        globalIndex++;
      }

      lastMergeNodeId = prevNodeId;
    }

    if (branches.length > 1 && lastMergeNodeId) {
      nodes.push({
        id: 'merge_compare',
        action: 'compare',
        description: 'Compare results across branches',
        dependencies: branches.map((b) => {
          const lastStep = b.plan.steps[b.plan.steps.length - 1];
          return `node_${b.branchId}_${lastStep?.index ?? 0}`;
        }),
        skillName: 'CompareSkill',
      });
    }

    const primary = branches[0]?.plan;
    const plan: AgentPlan = {
      taskId: primary?.taskId || '',
      goal,
      steps: mergedSteps,
      estimatedDuration: branches.reduce((sum, b) => sum + (b.plan.estimatedDuration || 60), 0),
      riskAssessment: this.mergeRisk(branches.map((b) => b.plan)),
      skillsUsed: branches.flatMap((b) => b.plan.skillsUsed || [b.skillName]),
      metadata: {
        executionGraph: true,
        branchCount: branches.length,
        branches: branches.map((b) => ({ id: b.branchId, skill: b.skillName })),
      },
    };

    return {
      plan,
      graph: { goal, domain, nodes, parallelBranches },
    };
  }

  graphFromLinearPlan(goal: string, domain: string, plan: AgentPlan): ExecutionGraph {
    const nodes: ExecutionNode[] = plan.steps.map((step, i) => ({
      id: `node_${step.index}`,
      action: step.action,
      description: step.description,
      dependencies: i === 0 ? [] : [`node_${plan.steps[i - 1].index}`],
      skillName: step.skillName,
      step,
    }));

    return { goal, domain, nodes, parallelBranches: [] };
  }

  private mergeRisk(plans: AgentPlan[]) {
    const levels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
    let maxIdx = 0;
    for (const p of plans) {
      const idx = levels.indexOf(p.riskAssessment?.overallRisk || 'LOW');
      if (idx > maxIdx) maxIdx = idx;
    }
    return {
      overallRisk: levels[maxIdx],
      reasons: plans.flatMap((p) => p.riskAssessment?.reasons || []),
      requiresUserApproval: plans.some((p) => p.riskAssessment?.requiresUserApproval),
    };
  }
}
