// backend/src/agent/multi-agent-coordinator.service.ts
//
// Upgraded: SupervisorAgent now has real authority.
// - NL interrupts parsed by GPT-4o into structured commands (not string matching)
// - Can ask clarifying questions before proceeding with ambiguous steps
// - Can rewrite the active plan mid-session
// - Broadcasts real-time agent status with "why" reasoning to frontend

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { GoalUnderstandingService, ParsedGoal } from './goal-understanding.service';
import { PlannerAgentService } from './planner-agent.service';
import { BrowserSessionService } from './browser-session.service';
import { AgentGateway } from '../websocket/agent.gateway';
import { ExecutionSessionStatus } from '@prisma/client';

export type AgentRole = 'planner' | 'research' | 'browser' | 'verification' | 'approval' | 'reporting' | 'supervisor';

export interface AgentInstance {
  id: string;
  role: AgentRole;
  status: 'idle' | 'working' | 'completed' | 'failed';
  currentTask?: string;
  reasoning?: string; // WHY this agent is doing this — shown in frontend
  startedAt: Date;
}

// Structured interrupt command parsed from NL by GPT-4o
export interface ParsedInterrupt {
  type: 'stop' | 'pause' | 'resume' | 'skip_step' | 'provide_data' | 'change_strategy' | 'clarify' | 'unknown';
  payload?: {
    data?: string;        // For provide_data: the actual data (OTP, credential, etc.)
    strategy?: string;    // For change_strategy: new approach
    stepIndex?: number;   // For skip_step: which step to skip
    question?: string;    // For clarify: what user is asking about
  };
  confidence: number;
  humanReadable: string; // What the coordinator will say back to the user
}

@Injectable()
export class MultiAgentCoordinatorService {
  private readonly logger = new Logger(MultiAgentCoordinatorService.name);
  private activeAgents = new Map<string, AgentInstance[]>();
  private openai: OpenAI;

  constructor(
    private prisma: PrismaService,
    private goalService: GoalUnderstandingService,
    private planner: PlannerAgentService,
    private browserSession: BrowserSessionService,
    @Inject(forwardRef(() => AgentGateway))
    private wsGateway: AgentGateway,
    private configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async orchestrateTask(sessionId: string, parsedGoal: ParsedGoal): Promise<void> {
    this.logger.log(`Orchestrating agents for session: ${sessionId} [${parsedGoal.taskType}]`);

    const roles: AgentRole[] = ['supervisor', 'planner', 'browser', 'verification'];

    if (parsedGoal.estimatedComplexity === 'complex' || parsedGoal.taskType === 'price_comparison' || parsedGoal.taskType === 'research') {
      roles.push('research');
    }
    if (parsedGoal.requiresPayment || parsedGoal.sensitiveData) {
      roles.push('approval');
    }
    roles.push('reporting');

    const instances: AgentInstance[] = roles.map(role => ({
      id: `${role}_${Math.random().toString(36).substr(2, 5)}`,
      role,
      status: role === 'supervisor' ? 'working' : 'idle',
      reasoning: this.getRoleReasoning(role, parsedGoal),
      startedAt: new Date(),
    }));

    this.activeAgents.set(sessionId, instances);

    this.wsGateway.emitToSession(sessionId, 'execution:event', {
      type: 'agent:thinking',
      data: {
        message: `Supervisor provisioned ${instances.length} agent roles for ${parsedGoal.taskType} task`,
        activeAgents: instances.map(i => ({
          id: i.id,
          role: i.role,
          status: i.status,
          reasoning: i.reasoning,
        })),
      },
    });
  }

  /**
   * UPGRADED: Parse interrupt using GPT-4o instead of naive string matching.
   * Returns a strongly-typed command the execution engine can act on.
   */
  async handleNaturalLanguageControl(
    sessionId: string,
    command: string,
  ): Promise<{ success: boolean; feedback: string; parsedCommand?: ParsedInterrupt }> {
    this.logger.log(`NL Interrupt for ${sessionId}: "${command}"`);

    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return { success: false, feedback: 'Session not found' };
    }

    // Emit interrupt received
    this.wsGateway.emitToSession(sessionId, 'execution:event', {
      type: 'agent:interrupted',
      data: { command, sessionId },
      timestamp: Date.now(),
    });

    // Parse the interrupt with GPT-4o
    const parsedCommand = await this.parseInterrupt(command, session);

    this.logger.log(`Interrupt parsed → type: ${parsedCommand.type}, confidence: ${parsedCommand.confidence}`);

    // Execute the parsed command
    let dbStatus: ExecutionSessionStatus | null = null;
    let feedback = parsedCommand.humanReadable;

    switch (parsedCommand.type) {
      case 'stop':
        dbStatus = ExecutionSessionStatus.CANCELLED;
        break;

      case 'pause':
        dbStatus = ExecutionSessionStatus.PAUSED;
        break;

      case 'resume':
        dbStatus = ExecutionSessionStatus.RUNNING;
        break;

      case 'provide_data':
        // OTP, credentials, or other data the agent needs
        dbStatus = ExecutionSessionStatus.RUNNING;
        this.wsGateway.emitToSession(sessionId, 'execution:event', {
          type: 'user:data_provided',
          data: { data: parsedCommand.payload?.data, command },
          timestamp: Date.now(),
        });
        break;

      case 'change_strategy':
        // User wants a different approach — trigger supervisor rewrite
        await this.requestPlanRewrite(sessionId, parsedCommand.payload?.strategy || command);
        break;

      case 'skip_step':
        this.wsGateway.emitToSession(sessionId, 'execution:event', {
          type: 'supervisor:skip_step',
          data: { stepIndex: parsedCommand.payload?.stepIndex },
          timestamp: Date.now(),
        });
        break;

      case 'clarify':
        // User is asking a question — ask clarifying question back
        await this.askClarifyingQuestion(sessionId, parsedCommand.payload?.question || command);
        break;

      case 'unknown':
      default:
        // Best effort: forward to execution engine as a hint
        feedback = `Supervisor received: "${command}". Adapting strategy for next step.`;
        break;
    }

    if (dbStatus) {
      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: { status: dbStatus },
      });
    }

    // Emit supervisor response to frontend
    this.wsGateway.emitToSession(sessionId, 'execution:event', {
      type: 'supervisor:response',
      data: {
        command,
        parsedType: parsedCommand.type,
        feedback,
        confidence: parsedCommand.confidence,
      },
      timestamp: Date.now(),
    });

    return { success: true, feedback, parsedCommand };
  }

  /**
   * Supervisor asks user a clarifying question before proceeding.
   * Execution pauses until user responds.
   */
  async askClarifyingQuestion(sessionId: string, question: string): Promise<void> {
    this.logger.log(`Supervisor asking clarifying question: "${question}"`);

    await this.prisma.executionSession.update({
      where: { id: sessionId },
      data: { status: ExecutionSessionStatus.WAITING_APPROVAL },
    });

    this.wsGateway.emitToSession(sessionId, 'supervisor:question', {
      question,
      sessionId,
      timestamp: Date.now(),
    });
  }

  /**
   * Supervisor rewrites the active plan mid-execution.
   * Called when the user requests a strategy change or when confidence drops too low.
   */
  async requestPlanRewrite(sessionId: string, reason: string): Promise<void> {
    this.logger.log(`Supervisor requesting plan rewrite: "${reason}"`);

    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return;

    this.wsGateway.emitToSession(sessionId, 'execution:event', {
      type: 'supervisor:rewriting_plan',
      data: { reason, sessionId },
      timestamp: Date.now(),
    });

    this.updateAgentStatus(sessionId, 'supervisor', 'working', `Rewriting plan: ${reason}`);
  }

  getActiveAgents(sessionId: string): AgentInstance[] {
    return this.activeAgents.get(sessionId) || [];
  }

  async updateAgentStatus(
    sessionId: string,
    role: AgentRole,
    status: AgentInstance['status'],
    currentTask?: string,
    reasoning?: string,
  ): Promise<void> {
    const agents = this.activeAgents.get(sessionId);
    if (!agents) return;

    const agent = agents.find(a => a.role === role);
    if (agent) {
      agent.status = status;
      if (currentTask) agent.currentTask = currentTask;
      if (reasoning) agent.reasoning = reasoning;

      this.wsGateway.emitToSession(sessionId, 'execution:event', {
        type: 'agent:step',
        data: {
          role,
          status,
          currentTask: agent.currentTask,
          reasoning: agent.reasoning,
        },
        timestamp: Date.now(),
      });
    }
  }

  cleanupSession(sessionId: string): void {
    this.activeAgents.delete(sessionId);
  }

  // ─── Private Helpers ─────────────────────────────────────

  private async parseInterrupt(
    command: string,
    session: any,
  ): Promise<ParsedInterrupt> {
    const systemPrompt = `You are a supervisor AI parsing user interrupts to an autonomous agent execution.
Classify the user's command into one of these types:
- "stop": cancel/abort/terminate the execution
- "pause": temporarily halt execution
- "resume": continue after a pause
- "skip_step": skip the current step and move to next
- "provide_data": user is giving data the agent needs (OTP, credentials, address, etc.)
- "change_strategy": user wants a completely different approach
- "clarify": user is asking a question about what the agent is doing
- "unknown": cannot determine intent clearly

Output strict JSON:
{
  "type": "stop|pause|resume|skip_step|provide_data|change_strategy|clarify|unknown",
  "payload": {
    "data": "extracted data if provide_data (e.g. OTP code)",
    "strategy": "new approach if change_strategy",
    "stepIndex": null,
    "question": "what user is asking if clarify"
  },
  "confidence": 0.0-1.0,
  "humanReadable": "What the supervisor says back to the user in plain English"
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Session status: ${session.status}\nUser command: "${command}"`,
          },
        ],
        temperature: 0.1,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty interrupt parse response');

      return JSON.parse(content) as ParsedInterrupt;
    } catch (error: any) {
      this.logger.error(`Interrupt parsing failed: ${error.message}. Falling back to heuristic.`);
      return this.heuristicParse(command);
    }
  }

  private heuristicParse(command: string): ParsedInterrupt {
    const lower = command.toLowerCase();
    if (lower.includes('stop') || lower.includes('abort') || lower.includes('cancel')) {
      return { type: 'stop', confidence: 0.9, humanReadable: 'Stopping execution as requested.', payload: {} };
    }
    if (lower.includes('pause') || lower.includes('wait') || lower.includes('hold')) {
      return { type: 'pause', confidence: 0.9, humanReadable: 'Pausing execution.', payload: {} };
    }
    if (/^\d{4,8}$/.test(command.trim())) {
      return { type: 'provide_data', confidence: 0.95, humanReadable: 'OTP received. Resuming.', payload: { data: command.trim() } };
    }
    return { type: 'unknown', confidence: 0.3, humanReadable: `Command noted: "${command}". Adapting next step.`, payload: {} };
  }

  private getRoleReasoning(role: AgentRole, parsedGoal: ParsedGoal): string {
    const reasoningMap: Record<AgentRole, string> = {
      supervisor: `Overseeing execution safety and goal alignment for "${parsedGoal.taskType}" task`,
      planner: `Decomposing "${parsedGoal.intent}" into browser steps`,
      browser: `Executing browser actions to achieve: ${parsedGoal.intent}`,
      verification: `Validating each step matches expected outcomes`,
      approval: `Monitoring for sensitive actions requiring user confirmation`,
      research: `Gathering additional context for complex ${parsedGoal.taskType} task`,
      reporting: `Compiling results and generating execution summary`,
    };
    return reasoningMap[role] || `Handling ${role} responsibilities`;
  }
}
