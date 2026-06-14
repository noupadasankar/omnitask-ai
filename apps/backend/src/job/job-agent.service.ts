import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}
import { JobApplicationStatus } from '@prisma/client';
import { JobMatchScorerService, JobPosting } from './job-match-scorer.service';
import { JobTrackerService } from './job-tracker.service';
import { JobPreferenceService } from './job-preference.service';
import { PrismaService } from '../prisma/prisma.service';
import { PythonBridgeService } from '../agent/runtime/python-bridge.service';

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

/** Payload to launch an autonomous apply run (from POST /job/launch). */
export interface LaunchJobAgentInput {
  portals?: string[];
  roles?: string[];
  locations?: string[];
  minScore?: number;
  maxApplications?: number;
  dryRun?: boolean;
  userProfile?: { name: string; email: string; phone: string };
  credentials?: Record<string, { email: string; password: string }>;
}

export interface LaunchJobAgentResult {
  sessionId: string;
  taskId: string;
  dispatched: boolean;
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
    private prisma: PrismaService,
    private pythonBridge: PythonBridgeService,
  ) {}

  /** Save an uploaded resume to the job_agent config directory. */
  async saveResume(file: UploadedFile): Promise<{ filename: string; saved: boolean }> {
    const ext = path.extname(file.originalname || 'resume.pdf').toLowerCase() || '.pdf';
    // apps/backend/src/job → ../../../ → apps/ → browser-py/agents/job_agent/config
    const configDir = path.join(__dirname, '../../../browser-py/agents/job_agent/config');
    await fs.mkdir(configDir, { recursive: true });
    const dest = path.join(configDir, `resume${ext}`);
    await fs.writeFile(dest, file.buffer);
    this.logger.log(`[JobAgent] Resume saved: ${dest}`);
    return { filename: `resume${ext}`, saved: true };
  }

  /**
   * Launch an autonomous apply run on the Python Playwright engine.
   *
   * Creates the Task + ExecutionSession the worker-event relay expects (so live
   * frames, approvals, and execution status all flow through the existing
   * `/agent` plumbing), then LPUSHes a `job_application` skill job onto the
   * Redis bridge. The agent streams each candidate as `application:result` and
   * gates every submit through the dashboard approval panel.
   */
  async launch(userId: string, input: LaunchJobAgentInput): Promise<LaunchJobAgentResult> {
    const pref = (await this.preferences.get(userId)) as any;

    // Effective run preferences: request overrides fall back to saved prefs.
    const portals = input.portals?.length ? input.portals : ['linkedin'];
    const roles = input.roles?.length ? input.roles : pref.roles ?? [];
    const locations = input.locations?.length ? input.locations : pref.locations ?? [];
    const minScore = input.minScore ?? pref.minScore ?? 60;
    const maxApplications = input.maxApplications ?? pref.dailyLimit ?? 20;

    const goal = `Auto-apply to ${roles.length ? roles.join(', ') : 'matching'} roles on ${portals.join(', ')}`;

    const task = await this.prisma.task.create({
      data: {
        userId,
        title: 'Job Application Agent',
        naturalLanguage: goal,
        status: 'RUNNING',
        trigger: 'SKILL',
        agentType: 'job_application',
        startedAt: new Date(),
      },
    });

    const session = await this.prisma.executionSession.create({
      data: {
        taskId: task.id,
        userId,
        status: 'RUNNING',
        metadata: { goal, routedDomain: 'job', skill: 'job_application' },
      },
    });

    // Preferences passed to the Python skill (flat shape the orchestrator's
    // override merge maps onto the rule-based matcher's nested config).
    const preferences = {
      portals,
      roles,
      locations,
      requiredKeywords: pref.requiredKeywords ?? [],
      preferredKeywords: pref.preferredKeywords ?? [],
      excludeKeywords: pref.excludeKeywords ?? [],
      minScore,
      maxApplications,
      ...(input.dryRun !== undefined ? { dryRun: input.dryRun } : {}),
      ...(input.userProfile ? { userProfile: input.userProfile } : {}),
      ...(input.credentials ? { credentials: input.credentials } : {}),
    };

    const alive = await this.pythonBridge.isAlive();
    if (!alive) {
      this.logger.warn(
        `[JobAgent] Python engine offline — launch ${session.id} queued but will not run until it is up`,
      );
    }

    await this.pythonBridge.dispatch({
      sessionId: session.id,
      taskId: task.id,
      userId,
      goal,
      skill: 'job_application',
      // The engine owns headless/headful (only it knows if a display exists).
      config: { viewport: { width: 1280, height: 800 }, preferences },
    });

    this.logger.log(
      `[JobAgent] launched session=${session.id} task=${task.id} portals=${portals.join(',')} max=${maxApplications} dryRun=${input.dryRun ?? 'env'}`,
    );

    return { sessionId: session.id, taskId: task.id, dispatched: alive };
  }

  /**
   * Request a stop for a running apply session. Sets the cancel flag the Python
   * engine polls between candidates, and marks the Task + ExecutionSession
   * CANCELLED. The relay won't overwrite CANCELLED when the engine finalizes.
   */
  async stop(userId: string, sessionId: string): Promise<{ stopped: boolean }> {
    const session = await this.prisma.executionSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, taskId: true },
    });
    if (!session) return { stopped: false };

    await this.pythonBridge.cancel(sessionId);

    await this.prisma.executionSession
      .update({
        where: { id: sessionId },
        data: { status: 'CANCELLED', completedAt: new Date() },
      })
      .catch(() => undefined);

    await this.prisma.task
      .update({
        where: { id: session.taskId },
        data: { status: 'CANCELLED', completedAt: new Date() },
      })
      .catch(() => undefined);

    this.logger.log(`[JobAgent] stop requested for session=${sessionId}`);
    return { stopped: true };
  }

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
