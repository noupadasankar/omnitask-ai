import { Injectable, Logger } from '@nestjs/common';

export interface CritiqueResult {
  passed: boolean;
  feedback: string;
  score: number;
}

@Injectable()
export class CriticService {
  private readonly logger = new Logger(CriticService.name);

  async evaluate(
    plan: { goal: string; steps: unknown[] },
    results: unknown[],
  ): Promise<CritiqueResult> {
    this.logger.log('Critic: evaluating execution');

    const expected = plan.steps?.length ?? 0;
    const completed = results.filter(
      (r) => r && typeof r === 'object' && (r as { success?: boolean }).success !== false,
    ).length;

    const score =
      expected > 0 ? Math.round((completed / expected) * 100) : 100;
    const passed = score >= 70;

    return {
      passed,
      score,
      feedback: passed
        ? `Execution met quality bar (${score}% steps successful).`
        : `Execution below threshold (${score}%). Consider re-planning.`,
    };
  }
}
