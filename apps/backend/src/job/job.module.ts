import { Module } from '@nestjs/common';
import { JobController } from './job.controller';
import { JobAgentService } from './job-agent.service';
import { JobMatchScorerService } from './job-match-scorer.service';
import { JobTrackerService } from './job-tracker.service';
import { JobPreferenceService } from './job-preference.service';

/**
 * Autonomous Job Application Agent — the decision/intelligence layer.
 *
 * Scraping and the actual apply run through the existing job portal plugins
 * (LinkedIn/Naukri/Indeed/Wellfound) on the Playwright engine; this module adds
 * rule-based scoring, application tracking + dedupe, and job preferences.
 */
@Module({
  controllers: [JobController],
  providers: [
    JobAgentService,
    JobMatchScorerService,
    JobTrackerService,
    JobPreferenceService,
  ],
  exports: [JobAgentService, JobMatchScorerService, JobTrackerService, JobPreferenceService],
})
export class JobModule {}
