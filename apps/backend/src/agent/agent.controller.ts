// backend/src/agent/agent.controller.ts

import {
  Controller,
  Post,
  Get,
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
import { StartExecutionDto, ApprovalResponseDto } from '../shared/dto/execution.dto';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(
    private executionEngine: ExecutionEngineService,
    private prisma: PrismaService,
  ) {}

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
      throw new HttpException('Approval not found', HttpStatus.NOT_FOUND);
    }

    const session = await this.prisma.executionSession.findUnique({
      where: { id: approval.sessionId },
    });

    if (session?.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    await this.executionEngine.handleApprovalResponse(
      dto.approvalRequestId,
      dto.status,
    );

    return { success: true };
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

  @Get('session/:sessionId/steps')
  async getSessionSteps(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ) {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== req.user.id) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    const plan = session.plan as any;
    return {
      steps: plan?.steps || [],
      currentStepIndex: session.currentStepIndex,
      totalSteps: session.totalSteps,
    };
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
}
