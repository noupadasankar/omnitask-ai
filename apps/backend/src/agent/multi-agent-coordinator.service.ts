import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoalUnderstandingService, ParsedGoal } from './goal-understanding.service';
import { PlannerAgentService } from './planner-agent.service';
import { BrowserSessionService } from './browser-session.service';
import { AgentGateway } from '../websocket/agent.gateway';
import { ExecutionSessionStatus } from '@prisma/client';

export type AgentRole = 'planner' | 'research' | 'browser' | 'verification' | 'approval' | 'reporting';

export interface AgentInstance {
  id: string;
  role: AgentRole;
  status: 'idle' | 'working' | 'completed' | 'failed';
  currentTask?: string;
  startedAt: Date;
}

@Injectable()
export class MultiAgentCoordinatorService {
  private readonly logger = new Logger(MultiAgentCoordinatorService.name);
  private activeAgents = new Map<string, AgentInstance[]>();

  constructor(
    private prisma: PrismaService,
    private goalService: GoalUnderstandingService,
    private planner: PlannerAgentService,
    private browserSession: BrowserSessionService,
    @Inject(forwardRef(() => AgentGateway))
    private wsGateway: AgentGateway,
  ) {}

  async orchestrateTask(sessionId: string, parsedGoal: ParsedGoal): Promise<void> {
    this.logger.log(`Orchestrating agents for session: ${sessionId} [${parsedGoal.taskType}]`);

    // Dynamic worker role assignment
    const roles: AgentRole[] = ['planner', 'browser', 'verification'];
    
    if (parsedGoal.estimatedComplexity === 'complex' || parsedGoal.taskType === 'price_comparison') {
      roles.push('research');
    }
    if (parsedGoal.requiresPayment || parsedGoal.sensitiveData) {
      roles.push('approval');
    }
    roles.push('reporting');

    const instances: AgentInstance[] = roles.map((role) => ({
      id: `${role}_${Math.random().toString(36).substr(2, 5)}`,
      role,
      status: 'idle',
      startedAt: new Date(),
    }));

    this.activeAgents.set(sessionId, instances);
    this.wsGateway.emitToSession(sessionId, 'agent:thinking', {
      message: 'Coordinator provisioning agent worker roles',
      activeAgents: instances.map((i) => ({ id: i.id, role: i.role, status: i.status })),
    });
  }

  getActiveAgents(sessionId: string): AgentInstance[] {
    return this.activeAgents.get(sessionId) || [];
  }

  async updateAgentStatus(
    sessionId: string,
    role: AgentRole,
    status: AgentInstance['status'],
    currentTask?: string,
  ): Promise<void> {
    const agents = this.activeAgents.get(sessionId);
    if (!agents) return;

    const agent = agents.find((a) => a.role === role);
    if (agent) {
      agent.status = status;
      if (currentTask) agent.currentTask = currentTask;
      
      this.wsGateway.emitToSession(sessionId, 'execution:event', {
        type: 'agent:step',
        data: {
          role,
          status,
          currentTask: agent.currentTask,
        },
        timestamp: Date.now(),
      });
    }
  }

  async handleNaturalLanguageControl(sessionId: string, command: string): Promise<{ success: boolean; feedback: string }> {
    this.logger.log(`Natural Language Control interrupt received for ${sessionId}: "${command}"`);

    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return { success: false, feedback: 'Session not found' };
    }

    this.wsGateway.emitToSession(sessionId, 'execution:event', {
      type: 'agent:interrupted',
      data: { command },
      timestamp: Date.now(),
    });

    // Parse interrupt details (e.g. choose cheaper, wait, skip, abort, OTP)
    const normalized = command.toLowerCase();
    let feedback = '';

    if (normalized.includes('stop') || normalized.includes('abort') || normalized.includes('cancel')) {
      feedback = 'Coordinator aborting current execution flow.';
      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: { status: ExecutionSessionStatus.CANCELLED },
      });
    } else if (normalized.includes('pause')) {
      feedback = 'Coordinator suspending execution.';
      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: { status: ExecutionSessionStatus.PAUSED },
      });
    } else if (normalized.includes('otp') || normalized.includes('code') || normalized.includes('verification')) {
      feedback = 'OTP credential update received. Propagating token.';
      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: { status: ExecutionSessionStatus.WAITING_APPROVAL, errorMessage: `OTP input queued: ${command}` },
      });
    } else {
      feedback = `Instruction received: "${command}". Adapting planner constraints for the next step.`;
    }

    return { success: true, feedback };
  }

  cleanupSession(sessionId: string): void {
    this.activeSessionsCleanup(sessionId);
  }

  private activeSessionsCleanup(sessionId: string) {
    this.activeAgents.delete(sessionId);
  }
}
