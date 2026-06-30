import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  Request,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JobApplicationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JobAgentService, LaunchJobAgentInput } from './job-agent.service';
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

  // ─── Resume upload ───────────────────────────────────────────────────────────

  @Post('resume')
  @UseInterceptors(FileInterceptor('resume'))
  async uploadResume(
    @Request() req: any,
    @UploadedFile() file: any,
  ) {
    return this.jobAgent.saveResume(file);
  }

  // ─── Launch an autonomous apply run (live view + approve-before-submit) ───────

  @Post('launch')
  async launch(@Request() req: any, @Body() body: LaunchJobAgentInput) {
    return this.jobAgent.launch(req.user.id, body || {});
  }

  @Post('stop')
  async stop(@Request() req: any, @Body() body: { sessionId: string }) {
    return this.jobAgent.stop(req.user.id, body.sessionId);
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
