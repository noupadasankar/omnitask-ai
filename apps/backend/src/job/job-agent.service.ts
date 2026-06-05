import { Injectable, Logger } from '@nestjs/common';
import { JobApplicationStatus } from '@prisma/client';
import { JobMatchScorerService, JobPosting } from './job-match-scorer.service';
import { JobTrackerService } from './job-tracker.service';
import { JobPreferenceService } from './job-preference.service';

export interface JobEvaluation {
  job: JobPosting;
  score: number;
  qualifies: boolean;
  reasons: string[];
  status: JobApplicationStatus;
  applicationId: string;
}

export interface BatchEvaluationResult {
  evaluated: number;
  duplicates: number;
  qualified: JobEvaluation[];
  skipped: JobEvaluation[];
  dailyLimitReached: boolean;
  remainingToday: number;
}

/**
 * Coordinates the Autonomous Job Application workflow's decision layer:
 *   dedupe → score → record → decide (apply vs skip), honoring the daily limit.
 *
 * Browser scraping + the actual apply are executed by the existing portal
 * plugins via the Playwright engine. Auto-apply uses approve-before-submit:
 * qualifying jobs are recorded PENDING_APPROVAL and the final submit step in the
 * plugin plan carries requiresApproval=true (the engine pauses for the user).
 */
@Injectable()
export class JobAgentService {
  private readonly logger = new Logger(JobAgentService.name);

  constructor(
    private scorer: JobMatchScorerService,
    private tracker: JobTrackerService,
    private preferences: JobPreferenceService,
  ) {}

  /**
   * Evaluate a batch of scraped postings for a user against their preferences.
   * Returns the qualifying set (capped by remaining daily quota) and records
   * every decision in the tracker for the dashboard + dedupe.
   */
  async evaluateBatch(userId: string, jobs: JobPosting[]): Promise<BatchEvaluationResult> {
    const pref = await this.preferences.get(userId);
    const scoring = this.preferences.toScoringPreferences(pref as any);
    const dailyLimit = (pref as any).dailyLimit ?? 20;

    const appliedToday = await this.tracker.appliedToday(userId);
    let remainingToday = Math.max(0, dailyLimit - appliedToday);

    const qualified: JobEvaluation[] = [];
    const skipped: JobEvaluation[] = [];
    let duplicates = 0;
    let evaluated = 0;

    for (const job of jobs) {
      // 1. Dedupe — never reconsider a job we've already recorded.
      if (await this.tracker.alreadySeen(userId, job.portal, job.externalJobId)) {
        duplicates++;
        continue;
      }
      evaluated++;

      // 2. Score against preferences.
      const match = this.scorer.score(job, scoring);

      // 3. Decide. Qualifying jobs within quota become PENDING_APPROVAL.
      let status: JobApplicationStatus;
      if (match.qualifies && remainingToday > 0) {
        status = 'PENDING_APPROVAL';
        remainingToday--;
      } else {
        status = 'SKIPPED';
      }

      // 4. Record (also dedupes future runs).
      const record = await this.tracker.recordMatch(userId, job, match, status);

      const evaluation: JobEvaluation = {
        job,
        score: match.score,
        qualifies: match.qualifies,
        reasons: match.reasons,
        status,
        applicationId: record.id,
      };
      (status === 'PENDING_APPROVAL' ? qualified : skipped).push(evaluation);
    }

    this.logger.log(
      `[JobAgent] user=${userId} evaluated=${evaluated} dup=${duplicates} qualified=${qualified.length} skipped=${skipped.length} remainingToday=${remainingToday}`,
    );

    return {
      evaluated,
      duplicates,
      qualified,
      skipped,
      dailyLimitReached: remainingToday <= 0,
      remainingToday,
    };
  }
}
