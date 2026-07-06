import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from './memory.service';
import { MemoryType } from '@prisma/client';

export interface SessionError {
  step: string;
  error: string;
  timestamp: string;
}

export interface SessionDecision {
  step: string;
  decision: string;
  rationale?: string;
  timestamp: string;
}

export interface IntermediateResult {
  key: string;
  value: any;
  step: string;
  timestamp: string;
}

export interface SessionContext {
  id: string;
  userId: string;
  goal: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  currentStep: string;
  intermediateResults: IntermediateResult[];
  errors: SessionError[];
  decisions: SessionDecision[];
  stepHistory: string[];
  createdAt: string;
  updatedAt: string;
  taskId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class SessionContextService {
  private readonly logger = new Logger(SessionContextService.name);

  constructor(
    private prisma: PrismaService,
    private memoryService: MemoryService,
  ) {}

  async createSession(
    userId: string,
    goal: string,
    taskId?: string,
    metadata?: Record<string, any>,
  ): Promise<SessionContext> {
    const session: SessionContext = {
      id: '',
      userId,
      goal,
      status: 'active',
      currentStep: '',
      intermediateResults: [],
      errors: [],
      decisions: [],
      stepHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      taskId,
      metadata,
    };

    const memory = await this.memoryService.store(userId, JSON.stringify(session), 'WORKING' as MemoryType, {
      summary: `Session: ${goal.substring(0, 120)}`,
      importance: 1.0,
      metadata: { sessionStatus: 'active', goal, taskId },
    });

    session.id = memory.id;
    await this.prisma.memory.update({
      where: { id: memory.id },
      data: { content: JSON.stringify(session) },
    });

    this.logger.debug(`Created session ${memory.id} for user ${userId}: ${goal.substring(0, 60)}`);
    return session;
  }

  async getSession(sessionId: string): Promise<SessionContext> {
    const memory = await this.prisma.memory.findUnique({ where: { id: sessionId } });
    if (!memory || memory.deletedAt) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    return this.parseContext(memory.content);
  }

  async getActiveSessions(userId: string): Promise<SessionContext[]> {
    const memories = await this.prisma.memory.findMany({
      where: {
        userId,
        type: 'WORKING' as MemoryType,
        deletedAt: null,
        metadata: { path: ['sessionStatus'], equals: 'active' },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return memories.map((m) => this.parseContext(m.content));
  }

  async updateSession(
    sessionId: string,
    updates: Partial<Pick<SessionContext, 'goal' | 'status' | 'currentStep' | 'metadata'>>,
  ): Promise<SessionContext> {
    const session = await this.getSession(sessionId);
    Object.assign(session, updates, { updatedAt: new Date().toISOString() });
    await this.prisma.memory.update({
      where: { id: sessionId },
      data: {
        content: JSON.stringify(session),
        summary: updates.status
          ? `Session: ${session.goal.substring(0, 120)} [${updates.status}]`
          : undefined,
        metadata: { sessionStatus: session.status, goal: session.goal, taskId: session.taskId },
      },
    });
    return session;
  }

  async updateStep(
    sessionId: string,
    step: string,
    result?: any,
  ): Promise<SessionContext> {
    const session = await this.getSession(sessionId);
    session.currentStep = step;
    if (!session.stepHistory.includes(step)) {
      session.stepHistory.push(step);
    }
    if (result !== undefined) {
      session.intermediateResults.push({
        key: step,
        value: result,
        step,
        timestamp: new Date().toISOString(),
      });
    }
    session.updatedAt = new Date().toISOString();
    await this.prisma.memory.update({
      where: { id: sessionId },
      data: { content: JSON.stringify(session) },
    });
    return session;
  }

  async recordError(sessionId: string, step: string, error: string): Promise<SessionContext> {
    const session = await this.getSession(sessionId);
    session.errors.push({ step, error, timestamp: new Date().toISOString() });
    session.updatedAt = new Date().toISOString();
    await this.prisma.memory.update({
      where: { id: sessionId },
      data: { content: JSON.stringify(session) },
    });
    return session;
  }

  async recordDecision(
    sessionId: string,
    step: string,
    decision: string,
    rationale?: string,
  ): Promise<SessionContext> {
    const session = await this.getSession(sessionId);
    session.decisions.push({ step, decision, rationale, timestamp: new Date().toISOString() });
    session.updatedAt = new Date().toISOString();
    await this.prisma.memory.update({
      where: { id: sessionId },
      data: { content: JSON.stringify(session) },
    });
    return session;
  }

  async completeSession(
    sessionId: string,
    outcome?: 'completed' | 'failed',
  ): Promise<SessionContext> {
    const session = await this.getSession(sessionId);
    session.status = outcome === 'failed' ? 'failed' : 'completed';
    session.updatedAt = new Date().toISOString();
    await this.prisma.memory.update({
      where: { id: sessionId },
      data: {
        content: JSON.stringify(session),
        type: 'EPISODIC' as MemoryType,
        summary: `Session: ${session.goal.substring(0, 120)} [${session.status}]`,
        importance: outcome === 'failed' ? 0.6 : 0.9,
        metadata: {
          sessionStatus: session.status,
          goal: session.goal,
          taskId: session.taskId,
          stepsCompleted: session.stepHistory.length,
          errorsCount: session.errors.length,
          decisionsCount: session.decisions.length,
        },
      },
    });
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.prisma.memory.update({
      where: { id: sessionId },
      data: { deletedAt: new Date() },
    });
  }

  private parseContext(content: string): SessionContext {
    try {
      const parsed = JSON.parse(content) as SessionContext;
      return {
        ...parsed,
        intermediateResults: parsed.intermediateResults || [],
        errors: parsed.errors || [],
        decisions: parsed.decisions || [],
        stepHistory: parsed.stepHistory || [],
      };
    } catch {
      throw new Error(`Failed to parse session context: ${content.substring(0, 100)}`);
    }
  }
}
