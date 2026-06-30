import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { ExecutionEngineService } from './execution-engine.service';
import { PrismaService } from '../prisma/prisma.service';

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
import { PreferenceMemoryService } from '../memory/preferences/preference-memory.service';
import { WorkerEventRelayService } from '../websocket/worker-event-relay.service';
import { OrchestratorPipelineService } from './orchestrator-pipeline.service';
import { SupervisorOrchestratorService } from './orchestration/supervisor-orchestrator.service';
import { OrchestrateSchema, ClarifySchema, RefineGoalSchema, ParseGoalSchema, ExecuteGoalSchema, StartExecutionSchema, NaturalLanguageCommandSchema, CreateScheduleSchema, ApprovalResponseSchema, UpdateScheduleSchema, SaveProfileSchema, SavePreferencesSchema, MultiAgentOrchestrateSchema } from './dto/agent.dto';
import type { OrchestrateDto, ClarifyDto, RefineGoalDto, ParseGoalDto, ExecuteGoalDto, StartExecutionDto, NaturalLanguageCommandDto, CreateScheduleDto, ApprovalResponseDto, UpdateScheduleDto, SaveProfileDto, SavePreferencesDto, MultiAgentOrchestrateDto } from './dto/agent.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CursorPaginationSchema } from '../common/dto/pagination.dto';
import type { CursorPaginationDto } from '../common/dto/pagination.dto';

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
    private orchestrator: OrchestratorPipelineService,
    private supervisorOrchestrator: SupervisorOrchestratorService,
  ) { }

  @Post('parse-goal')
  @HttpCode(HttpStatus.OK)
  async parseGoal(
    @Body(new ZodValidationPipe(ParseGoalSchema)) dto: ParseGoalDto,
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
    @Body(new ZodValidationPipe(RefineGoalSchema)) dto: RefineGoalDto,
  ) {
    return this.goalUnderstanding.refineGoal(dto.currentGoal, dto.userFeedback);
  }

  // Single-pass planning path. Distinct from POST /orchestrate (multi-agent),
  // which previously shadowed this route due to a duplicate path registration.
  // Rate limit: 10 plan-creation requests per minute per user
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('orchestrate/plan')
  async orchestrateTask(
    @Body(new ZodValidationPipe(OrchestrateSchema)) dto: OrchestrateDto,
    @Request() req: any,
  ) {
    const plan = await this.orchestrator.processTask(req.user.id, dto.goal);
    return plan;
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  async startAgentGoal(
    @Body(new ZodValidationPipe(ExecuteGoalSchema)) dto: ExecuteGoalDto,
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
  @HttpCode(HttpStatus.OK)
  async startExecution(
    @Body(new ZodValidationPipe(StartExecutionSchema)) dto: StartExecutionDto,
    @Request() req: any,
  ): Promise<{ sessionId: string }> {
    // Ownership check — prevent IDOR on taskId
    const task = await this.prisma.task.findUnique({ where: { id: dto.taskId } });
    if (!task || task.userId !== req.user.id) {
      throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    }

    const sessionId = await this.executionEngine.startExecution(
      req.user.id,
      dto.taskId,
      dto.goal,
      dto.config,
    );

    return { sessionId };
  }

  @Get('approvals')
  async getPendingApprovals(@Request() req: any) {
    return this.prisma.approvalRequest.findMany({
      where: {
        session: { userId: req.user.id },
        status: 'PENDING',
        deletedAt: null,
      },
      select: {
        id: true,
        sessionId: true,
        stepIndex: true,
        riskLevel: true,
        description: true,
        actionDetails: true,
        screenshotUrl: true,
        status: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('approve')
  @HttpCode(HttpStatus.OK)
  async submitApproval(
    @Body(new ZodValidationPipe(ApprovalResponseSchema)) dto: ApprovalResponseDto,
    @Request() req: any,
  ): Promise<{ success: boolean }> {
    const approval = await this.prisma.approvalRequest.findUnique({
      where: { id: dto.approvalRequestId },
      include: { session: { select: { userId: true } } },
    });

    if (!approval || approval.session.userId !== req.user.id) {
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
  @HttpCode(HttpStatus.OK)
  async rejectApproval(
    @Body(new ZodValidationPipe(ApprovalResponseSchema)) dto: ApprovalResponseDto,
    @Request() req: any,
  ): Promise<{ success: boolean }> {
    const approval = await this.prisma.approvalRequest.findUnique({
      where: { id: dto.approvalRequestId },
      include: { session: { select: { userId: true } } },
    });

    if (!approval || approval.session.userId !== req.user.id) {
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
  async interruptSession(
    @Param('sessionId') sessionId: string,
    @Body(new ZodValidationPipe(NaturalLanguageCommandSchema)) dto: NaturalLanguageCommandDto,
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

  @Get('session/:sessionId/replay')
  async getSessionReplay(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ) {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    const replayData = await this.replayService.getReplayData(sessionId);
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
    @Query(new ZodValidationPipe(CursorPaginationSchema)) query: CursorPaginationDto,
  ) {
    const pageSize = Math.min(query.take, 100);
    const decodedCursor = query.cursor
      ? (() => { try { return Buffer.from(query.cursor, 'base64url').toString('utf-8'); } catch { return undefined; } })()
      : undefined;

    const items = await this.prisma.executionSession.findMany({
      take: pageSize + 1,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        screenshots: { take: 1, orderBy: { timestamp: 'desc' } },
      },
    });

    const hasMore = items.length > pageSize;
    const data = hasMore ? items.slice(0, pageSize) : items;
    const last = data[data.length - 1];
    return {
      data,
      nextCursor: last && hasMore ? Buffer.from(last.id, 'utf-8').toString('base64url') : null,
      hasMore,
    };
  }

  @Get('memory')
  async getUserMemories(
    @Request() req: any,
    @Query(new ZodValidationPipe(CursorPaginationSchema)) query: CursorPaginationDto,
  ) {
    const pageSize = Math.min(query.take, 100);
    const decodedCursor = query.cursor
      ? (() => { try { return Buffer.from(query.cursor, 'base64url').toString('utf-8'); } catch { return undefined; } })()
      : undefined;

    const items = await this.prisma.agentMemory.findMany({
      take: pageSize + 1,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      where: { userId: req.user.id },
      orderBy: { lastAccessedAt: 'desc' },
    });

    const hasMore = items.length > pageSize;
    const data = hasMore ? items.slice(0, pageSize) : items;
    const last = data[data.length - 1];
    return {
      data,
      nextCursor: last && hasMore ? Buffer.from(last.id, 'utf-8').toString('base64url') : null,
      hasMore,
    };
  }

  // ─── Scheduled Tasks CRUD ────────────────────────────────

  @Get('schedules')
  @HttpCode(HttpStatus.OK)
  async getSchedules(@Request() req: any) {
    return this.prisma.schedule.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('schedules')
  @HttpCode(HttpStatus.CREATED)
  async createSchedule(
    @Body(new ZodValidationPipe(CreateScheduleSchema)) dto: CreateScheduleDto,
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
  async clarifyGoal(
    @Body(new ZodValidationPipe(ClarifySchema)) dto: ClarifyDto,
  ) {
    return this.goalUnderstanding.parseGoal(dto.goal);
  }
  @Put('schedules/:id')
  @HttpCode(HttpStatus.OK)
  async updateSchedule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateScheduleSchema)) dto: UpdateScheduleDto,
    @Request() req: any,
  ) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
    });

    if (!schedule || schedule.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    return this.scheduleService.updateSchedule(id, dto);
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
  @HttpCode(HttpStatus.OK)
  async saveProfile(
    @Request() req: any,
    @Body(new ZodValidationPipe(SaveProfileSchema)) dto: SaveProfileDto,
  ) {
    await this.profileMemory.saveProfileCard(req.user.id, dto);
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
  @HttpCode(HttpStatus.OK)
  async savePreferences(
    @Request() req: any,
    @Body(new ZodValidationPipe(SavePreferencesSchema)) dto: SavePreferencesDto,
  ) {
    await this.preferenceMemory.savePreferences(req.user.id, dto as any);
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

  // ─── WEEK 7: Multi-Agent Orchestration ─────────────────────────────────

  @Post('orchestrate')
  @HttpCode(HttpStatus.OK)
  async multiAgentOrchestrate(
    @Body(new ZodValidationPipe(MultiAgentOrchestrateSchema)) dto: MultiAgentOrchestrateDto,
    @Request() req: any,
  ) {
    const existingSession = await this.prisma.executionSession.findFirst({
      where: { userId: req.user.id, status: { in: ['RUNNING', 'PLANNING'] } },
      orderBy: { createdAt: 'desc' },
    });

    const sessionId = existingSession?.id || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!existingSession) {
      const task = await this.prisma.task.create({
        data: {
          userId: req.user.id,
          title: dto.goal.slice(0, 100),
          naturalLanguage: dto.goal,
          status: 'PLANNING',
        },
      });

      await this.prisma.executionSession.create({
        data: {
          id: sessionId,
          taskId: task.id,
          userId: req.user.id,
          status: 'PLANNING',
          metadata: { goal: dto.goal, mode: dto.mode, orchestrated: true },
        },
      });
    }

    const plan = await this.supervisorOrchestrator.orchestrate(req.user.id, sessionId, dto.goal);

    return {
      sessionId,
      planId: plan.id,
      status: plan.status,
      subGoals: plan.subGoals.map((sg) => ({
        id: sg.id,
        description: sg.description,
        agentType: sg.agentType,
        status: sg.status,
        dependencies: sg.dependencies,
      })),
      reasoning: plan.metadata['reasoning'],
      parallelGroups: plan.metadata['parallelGroups'],
      createdAt: plan.createdAt,
    };
  }

  @Get('orchestrate/:planId')
  @HttpCode(HttpStatus.OK)
  async getOrchestrationPlan(
    @Param('planId') planId: string,
    @Request() req: any,
  ) {
    const plan = await this.supervisorOrchestrator.getPlanStatus(planId);
    if (!plan) {
      throw new HttpException('Orchestration plan not found', HttpStatus.NOT_FOUND);
    }
    const session = await this.prisma.executionSession.findUnique({
      where: { id: plan.sessionId },
      select: { userId: true },
    });
    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Orchestration plan not found', HttpStatus.NOT_FOUND);
    }
    return {
      planId: plan.id,
      sessionId: plan.sessionId,
      status: plan.status,
      originalGoal: plan.originalGoal,
      subGoals: plan.subGoals.map((sg) => ({
        id: sg.id,
        description: sg.description,
        agentType: sg.agentType,
        status: sg.status,
        dependencies: sg.dependencies,
        error: sg.error,
        startedAt: sg.startedAt,
        completedAt: sg.completedAt,
      })),
      result: plan.result,
      createdAt: plan.createdAt,
      completedAt: plan.completedAt,
    };
  }

  @Post('orchestrate/:planId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelOrchestration(
    @Param('planId') planId: string,
    @Request() req: any,
  ) {
    const plan = await this.supervisorOrchestrator.getPlanStatus(planId);
    if (!plan) {
      throw new HttpException('Orchestration plan not found or already completed', HttpStatus.NOT_FOUND);
    }
    const session = await this.prisma.executionSession.findUnique({
      where: { id: plan.sessionId },
      select: { userId: true },
    });
    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Orchestration plan not found', HttpStatus.NOT_FOUND);
    }
    const cancelled = await this.supervisorOrchestrator.cancelPlan(planId);
    if (!cancelled) {
      throw new HttpException('Orchestration plan not found or already completed', HttpStatus.NOT_FOUND);
    }
    return { success: true, message: 'Orchestration cancelled' };
  }
}
