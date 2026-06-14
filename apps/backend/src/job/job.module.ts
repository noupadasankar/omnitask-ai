import { Module } from '@nestjs/common';
import { JobController } from './job.controller';
import { JobAgentService } from './job-agent.service';
import { JobMatchScorerService } from './job-match-scorer.service';
import { JobTrackerService } from './job-tracker.service';
import { JobPreferenceService } from './job-preference.service';
import { PythonBridgeService } from '../agent/runtime/python-bridge.service';

/**
 * Autonomous Job Application Agent — the decision/intelligence layer.
 *
 * Scraping and the actual apply run through the existing job portal plugins
 * (LinkedIn/Naukri/Indeed/Wellfound) on the Playwright engine; this module adds
 * rule-based scoring, application tracking + dedupe, and job preferences.
 *
 * PythonBridgeService is provided directly (not imported from RuntimeModule) so
 * launching an apply run doesn't couple this module to the whole agent runtime
 * graph. It is a stateless Redis LPUSH/heartbeat client — a second instance is
 * harmless.
 */
@Module({
  controllers: [JobController],
  providers: [
    JobAgentService,
    JobMatchScorerService,
    JobTrackerService,
    JobPreferenceService,
    PythonBridgeService,
  ],
  exports: [JobAgentService, JobMatchScorerService, JobTrackerService, JobPreferenceService],
})
export class JobModule {}
