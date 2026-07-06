import {
  Controller, Get, Post, Patch, Delete,
  Param, Query, Body, UseGuards, Request,
  BadRequestException,
} from '@nestjs/common';
import { MemoryService } from './memory.service';
import { SessionContextService } from './session-context.service';
import { EpisodicMemoryService, EpisodeFilter } from './episodic-memory.service';
import { SemanticMemoryService, SemanticFact } from './semantic-memory.service';
import { ProceduralMemoryService, WorkflowStep } from './procedural-memory.service';
import { MemoryConsolidationService } from './memory-consolidation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MemoryType } from '@prisma/client';
import { CursorPaginationSchema } from '../common/dto/pagination.dto';
import type { CursorPaginationDto } from '../common/dto/pagination.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { z } from 'zod';

const CreateSessionSchema = z.object({
  goal: z.string().min(1).max(2000),
  taskId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const UpdateSessionSchema = z.object({
  goal: z.string().min(1).max(2000).optional(),
  status: z.enum(['active', 'paused', 'completed', 'failed']).optional(),
  currentStep: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const RecordStepSchema = z.object({
  step: z.string().min(1).max(500),
  result: z.any().optional(),
});

const RecordErrorSchema = z.object({
  step: z.string().min(1).max(500),
  error: z.string().min(1).max(5000),
});

const RecordDecisionSchema = z.object({
  step: z.string().min(1).max(500),
  decision: z.string().min(1).max(2000),
  rationale: z.string().max(5000).optional(),
});

const CompleteSessionSchema = z.object({
  outcome: z.enum(['completed', 'failed']).optional(),
  learnings: z.array(z.string()).optional(),
  artifacts: z.array(z.object({
    name: z.string(), type: z.string(), reference: z.string(),
  })).optional(),
});

const StoreFactSchema = z.object({
  topic: z.string().min(1).max(200),
  fact: z.string().min(1).max(5000),
  confidence: z.number().min(0).max(1).default(0.7),
  source: z.enum(['explicit', 'inference', 'observation', 'session']).default('inference'),
});

const ExtractWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  triggerPattern: z.string().min(1).max(1000),
  steps: z.array(z.object({
    order: z.number().int().min(0),
    description: z.string().min(1).max(500),
    agentType: z.string().optional(),
  })),
  tags: z.array(z.string()).optional(),
});

const WorkflowOutcomeSchema = z.object({
  success: z.boolean(),
  duration: z.number().min(0),
});

const SuggestWorkflowSchema = z.object({
  goal: z.string().min(1).max(2000),
});

@Controller('memory')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly sessionContextService: SessionContextService,
    private readonly episodicMemoryService: EpisodicMemoryService,
    private readonly semanticMemoryService: SemanticMemoryService,
    private readonly proceduralMemoryService: ProceduralMemoryService,
    private readonly memoryConsolidationService: MemoryConsolidationService,
  ) {}

  // ──────────── Existing endpoints ────────────

  @Get()
  getRecent(
    @Request() req: { user: { id: string } },
    @Query(new ZodValidationPipe(CursorPaginationSchema)) query: CursorPaginationDto,
  ) {
    return this.memoryService.getRecentPaginated(req.user.id, query.cursor, query.take);
  }

  @Get('search')
  search(
    @Request() req: { user: { id: string } },
    @Query('q') q: string,
    @Query('type') type?: MemoryType,
  ) {
    return this.memoryService.retrieveRelevant(req.user.id, q || '', { type });
  }

  // ──────────── Session Context endpoints ────────────

  @Post('session')
  async createSession(
    @Request() req: { user: { id: string } },
    @Body(new ZodValidationPipe(CreateSessionSchema)) body: z.infer<typeof CreateSessionSchema>,
  ) {
    return this.sessionContextService.createSession(req.user.id, body.goal, body.taskId, body.metadata);
  }

  @Get('session')
  async getActiveSessions(@Request() req: { user: { id: string } }) {
    return this.sessionContextService.getActiveSessions(req.user.id);
  }

  @Get('session/:id')
  async getSession(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    const session = await this.sessionContextService.getSession(id);
    if (!session || session.userId !== req.user.id) {
      throw new BadRequestException('Session not found');
    }
    return session;
  }

  @Patch('session/:id')
  async updateSession(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSessionSchema)) body: z.infer<typeof UpdateSessionSchema>,
  ) {
    return this.sessionContextService.updateSession(id, body);
  }

  @Post('session/:id/step')
  async recordStep(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RecordStepSchema)) body: z.infer<typeof RecordStepSchema>,
  ) {
    return this.sessionContextService.updateStep(id, body.step, body.result);
  }

  @Post('session/:id/error')
  async recordError(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RecordErrorSchema)) body: z.infer<typeof RecordErrorSchema>,
  ) {
    return this.sessionContextService.recordError(id, body.step, body.error);
  }

  @Post('session/:id/decision')
  async recordDecision(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RecordDecisionSchema)) body: z.infer<typeof RecordDecisionSchema>,
  ) {
    return this.sessionContextService.recordDecision(id, body.step, body.decision, body.rationale);
  }

  @Post('session/:id/complete')
  async completeSession(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CompleteSessionSchema)) body: z.infer<typeof CompleteSessionSchema>,
  ) {
    const session = await this.sessionContextService.completeSession(id, body.outcome);
    if (body.learnings || body.artifacts) {
      await this.episodicMemoryService.storeEpisode(
        session.userId,
        {
          goal: session.goal,
          steps: session.stepHistory,
          decisions: session.decisions.map((d) => ({ step: d.step, decision: d.decision, rationale: d.rationale })),
          errors: session.errors.map((e) => e.error),
          duration: new Date(session.updatedAt).getTime() - new Date(session.createdAt).getTime(),
          taskId: session.taskId,
          metadata: session.metadata,
        },
        session.status === 'failed' ? 'failure' : 'success',
        session.status === 'failed' ? 0.2 : 0.85,
        body.learnings,
        body.artifacts,
      );
    }
    return session;
  }

  @Delete('session/:id')
  async deleteSession(@Param('id') id: string) {
    await this.sessionContextService.deleteSession(id);
    return { deleted: true };
  }

  // ──────────── Episodic Memory endpoints ────────────

  @Get('episodes')
  async getEpisodes(
    @Request() req: { user: { id: string } },
    @Query('outcome') outcome?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('minQuality') minQuality?: string,
  ) {
    if (outcome && !['success', 'failure', 'partial'].includes(outcome)) {
      throw new BadRequestException('outcome must be success, failure, or partial');
    }
    const filter: EpisodeFilter = {};
    if (outcome) filter.outcome = outcome as any;
    if (limit) filter.limit = Math.min(parseInt(limit, 10) || 20, 100);
    if (offset) filter.offset = parseInt(offset, 10) || 0;
    if (dateFrom) filter.dateFrom = dateFrom;
    if (dateTo) filter.dateTo = dateTo;
    if (minQuality) filter.minQuality = parseFloat(minQuality);
    return this.episodicMemoryService.getEpisodes(req.user.id, filter);
  }

  @Get('episodes/:id')
  async getEpisode(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    const episode = await this.episodicMemoryService.getEpisode(id);
    if (!episode || episode.userId !== req.user.id) {
      throw new BadRequestException('Episode not found');
    }
    return episode;
  }

  // ──────────── Semantic Memory (Facts) endpoints ────────────

  @Get('facts')
  async getFacts(
    @Request() req: { user: { id: string } },
    @Query('topic') topic?: string,
  ) {
    return this.semanticMemoryService.retrieveFacts(req.user.id, topic);
  }

  @Post('facts')
  async storeFact(
    @Request() req: { user: { id: string } },
    @Body(new ZodValidationPipe(StoreFactSchema)) body: z.infer<typeof StoreFactSchema>,
  ) {
    try {
      return await this.semanticMemoryService.storeFact(
        req.user.id, body.topic, body.fact, body.confidence, body.source,
      );
    } catch (e: any) {
      if (e.message?.includes('conflict')) throw e;
      throw new BadRequestException(e.message);
    }
  }

  @Get('facts/topics')
  async getFactTopics(@Request() req: { user: { id: string } }) {
    return this.semanticMemoryService.getAllTopics(req.user.id);
  }

  @Get('facts/search')
  async searchFacts(
    @Request() req: { user: { id: string } },
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.semanticMemoryService.retrieveRelevantFacts(req.user.id, q || '', limit ? parseInt(limit, 10) : 10);
  }

  // ──────────── Procedural Memory (Workflow) endpoints ────────────

  @Get('workflows')
  async listWorkflows(
    @Request() req: { user: { id: string } },
    @Query('tags') tags?: string,
    @Query('minSuccessRate') minSuccessRate?: string,
  ) {
    const tagList = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
    const minRate = minSuccessRate ? parseFloat(minSuccessRate) : undefined;
    return this.proceduralMemoryService.listWorkflows(req.user.id, tagList, minRate);
  }

  @Post('workflows')
  async extractWorkflow(
    @Request() req: { user: { id: string } },
    @Body(new ZodValidationPipe(ExtractWorkflowSchema)) body: z.infer<typeof ExtractWorkflowSchema>,
  ) {
    return this.proceduralMemoryService.extractWorkflow(
      req.user.id, body.name, body.triggerPattern, body.steps, body.tags,
    );
  }

  @Get('workflows/:id')
  async getWorkflow(@Param('id') id: string) {
    return this.proceduralMemoryService.getWorkflow(id);
  }

  @Post('workflows/:id/outcome')
  async recordWorkflowOutcome(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(WorkflowOutcomeSchema)) body: z.infer<typeof WorkflowOutcomeSchema>,
  ) {
    return this.proceduralMemoryService.recordOutcome(id, body.success, body.duration);
  }

  @Post('workflows/suggest')
  async suggestWorkflow(
    @Request() req: { user: { id: string } },
    @Body(new ZodValidationPipe(SuggestWorkflowSchema)) body: z.infer<typeof SuggestWorkflowSchema>,
  ) {
    const suggestion = await this.proceduralMemoryService.suggestWorkflow(req.user.id, body.goal);
    if (!suggestion) {
      return { suggested: false, message: 'No matching workflow found for this goal' };
    }
    return { suggested: true, ...suggestion };
  }

  // ──────────── Consolidation endpoint ────────────

  @Post('consolidate')
  async consolidate(@Request() req: { user: { id: string } }) {
    return this.memoryConsolidationService.consolidateUser(req.user.id);
  }
}
