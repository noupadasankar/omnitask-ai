import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExecutionEngineService } from './execution-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  StartExecutionDto,
  ExecuteGoalDto,
  ParseGoalDto,
  NaturalLanguageCommandDto,
  CreateScheduleDto,
  ApprovalResponseDto,
} from '../shared/dto/execution.dto';

// New services
import { GoalUnderstandingService } from './goal-understanding.service';
import { MultiAgentCoordinatorService } from './multi-agent-coordinator.service';
import { TaskReplayService } from './task-replay.service';
import { ScheduledTaskService } from './scheduled-task.service';
import { ExecutionMemoryService } from './execution-memory.service';
import { UserProfileMemoryService } from './user-profile-memory.service';
import { SkillRegistryService } from './skill-registry.service';
// ─── COS Telemetry ─────────────────────────────────────────────────
import { WorldStateService } from './world-state.service';
import { DriftDetectorService } from './drift-detector.service';
import { AgentRegistryService } from '../agent-registry/agent-registry.service';
import { PreferenceMemoryService, UserDomainPreferences } from '../memory/preferences/preference-memory.service';
import { WorkerEventRelayService } from '../websocket/worker-event-relay.service';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(
    private executionEngine: ExecutionEngineService,
    private prisma: PrismaService,
    private goalUnderstanding: GoalUnderstandingService,
    private coordinator: MultiAgentCoordinatorService,
    private replayService: TaskReplayService,
    private scheduleService: ScheduledTaskService,
    private executionMemory: ExecutionMemoryService,
    private profileMemory: UserProfileMemoryService,
    private skillRegistry: SkillRegistryService,
    // ─── COS Telemetry ─────────────────────────────────────────────
    private worldStateService: WorldStateService,
    private driftDetectorService: DriftDetectorService,
    private agentRegistry: AgentRegistryService,
    private preferenceMemory: PreferenceMemoryService,
    private workerRelay: WorkerEventRelayService,
  ) { }

  @Post('parse-goal')
  async parseGoal(
    @Body() dto: ParseGoalDto,
    @Request() req: any,
  ) {
    const memories = await this.prisma.agentMemory.findMany({
      where: { userId: req.user.id },
      take: 5,
    });

    const parsed = await this.goalUnderstanding.parseGoal(dto.goal, {
      memories: memories.map((m: any) => m.content),
    });

    return parsed;
  }

  @Post('refine-goal')
  async refineGoal(
    @Body() dto: { currentGoal: any; userFeedback: string },
  ) {
    return this.goalUnderstanding.refineGoal(dto.currentGoal, dto.userFeedback);
  }

  @Post('start')
  async startAgentGoal(
    @Body() dto: ExecuteGoalDto,
    @Request() req: any,
  ): Promise<{ sessionId: string; parsedGoal: any }> {
    // 1. Learn/extract preferences implicitly
    await this.executionMemory.extractAndSavePreferencesFromGoal(req.user.id, dto.goal);
    await this.profileMemory.autoLearnFromUserInteraction(req.user.id, dto.goal);

    // 2. Parse Goal
    const parsedGoal = await this.goalUnderstanding.parseGoal(dto.goal);
    if (dto.preferredSites?.length) {
      parsedGoal.preferredWebsites = Array.from(
        new Set([...(parsedGoal.preferredWebsites || []), ...dto.preferredSites]),
      );
    }

    // Ambiguity Gate Check: if goal is too vague, return questions before creating task or session
    if (parsedGoal.ambiguityScore > 0.6) {
      return { sessionId: '', parsedGoal };
    }

    // 3. Create a DB Task first
    const task = await this.prisma.task.create({
      data: {
        userId: req.user.id,
        title: parsedGoal.intent.slice(0, 100),
        naturalLanguage: dto.goal,
        status: 'PLANNING',
        priority: 'MEDIUM',
      },
    });

    // 4. Start execution engine (pass parsedGoal for StrategyMemory + VerifierAgent)
    const sessionId = await this.executionEngine.startExecution(
      req.user.id,
      task.id,
      dto.goal,
      {
        headless: true,
        // Mode mapping
        maxRetries: dto.mode === 'simulation' ? 0 : 3,
        profile: dto.profile,
        // Automation-gate inputs — decide whether the browser may auto-launch.
        mode: dto.mode,
        allowPayments: dto.allowPayments,
        allowLogin: dto.allowLogin,
      },
      parsedGoal,
    );

    // 5. Orchestrate workers
    await this.coordinator.orchestrateTask(sessionId, parsedGoal);

    return { sessionId, parsedGoal };
  }

  @Post('execute')
  async startExecution(
    @Body() dto: StartExecutionDto,
    @Request() req: any,
  ): Promise<{ sessionId: string }> {
    const sessionId = await this.executionEngine.startExecution(
      req.user.id,
      dto.taskId,
      dto.goal,
      dto.config,
    );

    return { sessionId };
  }

  @Post('approve')
  async submitApproval(
    @Body() dto: ApprovalResponseDto,
    @Request() req: any,
  ): Promise<{ success: boolean }> {
    const approval = await this.prisma.approvalRequest.findUnique({
      where: { id: dto.approvalRequestId },
    });

    if (!approval) {
      throw new HttpException('Approval request not found', HttpStatus.NOT_FOUND);
    }

    await this.executionEngine.handleApprovalResponse(
      dto.approvalRequestId,
      'APPROVED',
    );
    await this.workerRelay.setApprovalDecision(
      approval.sessionId,
      approval.stepIndex,
      'APPROVED',
    );
    return { success: true };
  }

  @Post('reject')
  async rejectApproval(
    @Body() dto: ApprovalResponseDto,
    @Request() req: any,
  ): Promise<{ success: boolean }> {
    const approval = await this.prisma.approvalRequest.findUnique({
      where: { id: dto.approvalRequestId },
    });

    if (!approval) {
      throw new HttpException('Approval request not found', HttpStatus.NOT_FOUND);
    }

    await this.executionEngine.handleApprovalResponse(
      dto.approvalRequestId,
      'DENIED',
    );
    await this.workerRelay.setApprovalDecision(
      approval.sessionId,
      approval.stepIndex,
      'DENIED',
    );
    return { success: true };
  }

  @Post('session/:sessionId/interrupt')
  @Post(':sessionId/interrupt')
  async interruptSession(
    @Param('sessionId') sessionId: string,
    @Body() dto: NaturalLanguageCommandDto,
    @Request() req: any,
  ): Promise<{ success: boolean; feedback: string }> {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    return this.coordinator.handleNaturalLanguageControl(sessionId, dto.command);
  }

  @Post('session/:sessionId/pause')
  @Post(':sessionId/pause')
  async pauseSession(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ): Promise<{ success: boolean }> {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    await this.executionEngine.pauseExecution(sessionId);
    return { success: true };
  }

  @Post('session/:sessionId/resume')
  @Post(':sessionId/resume')
  async resumeSession(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ): Promise<{ success: boolean }> {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    await this.executionEngine.resumeExecution(sessionId);
    return { success: true };
  }

  @Post('session/:sessionId/cancel')
  @Post(':sessionId/cancel')
  @Post(':sessionId/stop')
  @Post('session/:sessionId/stop')
  async cancelSession(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ): Promise<{ success: boolean }> {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    await this.executionEngine.cancelExecution(sessionId);
    return { success: true };
  }

  @Get('session/:sessionId')
  async getSession(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ) {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
      include: {
        screenshots: true,
        approvalRequests: true,
      },
    });

    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    return session;
  }

  @Get('replay/:id')
  @Get('session/:sessionId/replay')
  async getSessionReplay(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ) {
    const sId = id || sessionId;
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sId },
    });

    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    const replayData = await this.replayService.getReplayData(sId);
    return { replay: replayData };
  }

  @Get('session/:sessionId/thoughts')
  async getSessionThoughts(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ) {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    const thoughts = await this.replayService.getReplayThoughts(sessionId);
    return { thoughts };
  }

  @Get('session/:sessionId/timeline')
  async getSessionTimeline(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ) {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    return this.replayService.getSessionTimeline(sessionId);
  }

  @Get('history')
  async getUserHistory(
    @Request() req: any,
  ) {
    const sessions = await this.prisma.executionSession.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        screenshots: { take: 1, orderBy: { timestamp: 'desc' } },
      },
    });

    return sessions;
  }

  @Get('memory')
  async getUserMemories(
    @Request() req: any,
  ) {
    const memories = await this.prisma.agentMemory.findMany({
      where: { userId: req.user.id },
      orderBy: { lastAccessedAt: 'desc' },
      take: 100,
    });

    return memories;
  }

  // ─── Scheduled Tasks CRUD ────────────────────────────────

  @Get('schedules')
  async getSchedules(@Request() req: any) {
    return this.prisma.schedule.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('schedules')
  async createSchedule(
    @Body() dto: CreateScheduleDto,
    @Request() req: any,
  ) {
    return this.scheduleService.createSchedule(
      req.user.id,
      dto.name,
      dto.cronExpression,
      dto.goal,
      dto.config || {},
    );
  }
  @Post('clarify')
  async clarifyGoal(@Body('goal') goal: string) {
    return this.goalUnderstanding.parseGoal(goal);
  }
  @Put('schedules/:id')
  async updateSchedule(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
    });

    if (!schedule || schedule.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    return this.scheduleService.updateSchedule(id, body);
  }

  @Delete('schedules/:id')
  async deleteSchedule(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
    });

    if (!schedule || schedule.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    await this.scheduleService.deleteSchedule(id);
    return { success: true };
  }

  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.profileMemory.getProfileCard(req.user.id);
  }

  @Post('profile')
  async saveProfile(@Request() req: any, @Body() body: any) {
    await this.profileMemory.saveProfileCard(req.user.id, body);
    return { success: true };
  }

  @Get('skills')
  async getSkills() {
    return this.skillRegistry.listSkills();
  }

  /** Agent Registry + Plugin marketplace foundation */
  @Get('registry')
  async getRegistry() {
    return {
      agents: this.agentRegistry.listAgents(),
      plugins: this.agentRegistry.listPlugins(),
    };
  }

  /** Learned domain preferences (job sites, food apps, etc.) */
  @Get('preferences')
  async getPreferences(@Request() req: any) {
    return this.preferenceMemory.getPreferences(req.user.id);
  }

  @Put('preferences')
  async savePreferences(
    @Request() req: any,
    @Body() body: UserDomainPreferences,
  ) {
    await this.preferenceMemory.savePreferences(req.user.id, body);
    return { success: true };
  }

  // ─── COS Telemetry Endpoints ──────────────────────────────────

  /**
   * Returns the live World State Object (WSO) for a running session.
   * The frontend CognitivHUD polls this to hydrate on reconnect.
   */
  @Get('session/:sessionId/wso')
  async getWorldState(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ) {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }
    const wso = this.worldStateService.getState(sessionId);
    return {
      sessionId,
      wso: wso
        ? {
          stateConfidence: wso.stateConfidence,
          beliefSourceConsensus: wso.beliefSourceConsensus,
          version: wso.version,
          belief: Object.fromEntries(
            Object.entries(wso.belief).map(([k, v]) => [
              k,
              { value: v.value, confidence: v.sourceConfidence, source: v.source },
            ])
          ),
        }
        : null,
    };
  }

  /**
   * Returns aggregated COS diagnostics for a session:
   * execution profile, session metadata, and current wso confidence.
   */
  @Get('session/:sessionId/diagnostics')
  async getSessionDiagnostics(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ) {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }
    const wso = this.worldStateService.getState(sessionId);
    const meta = session.metadata as Record<string, any> | null;
    return {
      sessionId,
      profile: meta?.profile ?? 'balanced',
      goal: meta?.goal ?? '',
      status: session.status,
      currentStepIndex: session.currentStepIndex,
      totalSteps: session.totalSteps,
      wsoConfidence: wso?.stateConfidence ?? null,
      beliefConsensus: wso?.beliefSourceConsensus ?? null,
      wsoVersion: wso?.version ?? null,
    };
  }
}
