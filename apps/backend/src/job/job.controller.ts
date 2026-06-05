import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JobApplicationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JobAgentService } from './job-agent.service';
import { JobTrackerService } from './job-tracker.service';
import { JobPreferenceService, JobPreferenceInput } from './job-preference.service';
import { JobPosting } from './job-match-scorer.service';

@Controller('job')
@UseGuards(JwtAuthGuard)
export class JobController {
  constructor(
    private jobAgent: JobAgentService,
    private tracker: JobTrackerService,
    private preferences: JobPreferenceService,
  ) {}

  // ─── Preferences ─────────────────────────────────────────────────────────────

  @Get('preferences')
  async getPreferences(@Request() req: any) {
    return this.preferences.get(req.user.id);
  }

  @Put('preferences')
  async savePreferences(@Request() req: any, @Body() body: JobPreferenceInput) {
    return this.preferences.save(req.user.id, body);
  }

  // ─── Evaluate scraped postings (dedupe → score → record → decide) ────────────

  @Post('evaluate')
  async evaluate(@Request() req: any, @Body() body: { jobs: JobPosting[] }) {
    return this.jobAgent.evaluateBatch(req.user.id, body.jobs || []);
  }

  // ─── Application tracking ────────────────────────────────────────────────────

  @Get('applications')
  async applications(
    @Request() req: any,
    @Query('status') status?: JobApplicationStatus,
  ) {
    return this.tracker.list(req.user.id, status);
  }

  @Get('stats')
  async stats(@Request() req: any) {
    return this.tracker.stats(req.user.id);
  }
}
