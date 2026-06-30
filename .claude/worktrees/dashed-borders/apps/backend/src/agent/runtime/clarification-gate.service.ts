import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GoalUnderstandingService, ParsedGoal } from '../goal-understanding.service';
import { AgentGateway } from '../../websocket/agent.gateway';
import { WorkerEventRelayService } from '../../websocket/worker-event-relay.service';

const CLARIFICATION_THRESHOLD = 0.6;
const CLARIFICATION_TIMEOUT_MS = 5 * 60 * 1000;

@Injectable()
export class ClarificationGateService {
  private readonly logger = new Logger(ClarificationGateService.name);

  constructor(
    private prisma: PrismaService,
    private goalUnderstanding: GoalUnderstandingService,
    @Inject(forwardRef(() => AgentGateway))
    private wsGateway: AgentGateway,
    @Inject(forwardRef(() => WorkerEventRelayService))
    private workerRelay: WorkerEventRelayService,
  ) {}

  needsClarification(parsedGoal?: ParsedGoal): boolean {
    return !!parsedGoal && parsedGoal.ambiguityScore > CLARIFICATION_THRESHOLD;
  }

  /**
   * Pauses execution, emits questions, waits for user answer, refines goal.
   * Returns refined goal or null on timeout.
   */
  async runGate(
    sessionId: string,
    parsedGoal: ParsedGoal,
    goalText: string,
  ): Promise<{ refinedGoal: ParsedGoal; goalText: string } | null> {
    this.logger.log(
      `[ClarificationGate] ambiguity=${parsedGoal.ambiguityScore.toFixed(2)} → pausing session ${sessionId}`,
    );

    await this.prisma.executionSession.update({
      where: { id: sessionId },
      data: { status: 'WAITING_APPROVAL' },
    });

    this.wsGateway.emitToSession(sessionId, 'clarification:required', {
      sessionId,
      ambiguityScore: parsedGoal.ambiguityScore,
      clarifyingQuestions: parsedGoal.clarifyingQuestions,
      parsedGoal,
    });

    const userAnswers = await this.waitForAnswer(sessionId, CLARIFICATION_TIMEOUT_MS);
    if (!userAnswers) {
      await this.prisma.executionSession.update({
        where: { id: sessionId },
        data: { status: 'FAILED', errorMessage: 'Clarification timed out' },
      });
      this.wsGateway.emitToSession(sessionId, 'execution:failed', {
        reason: 'clarification_timeout',
        message: 'No clarification received within 5 minutes.',
      });
      return null;
    }

    const refinedGoal = await this.goalUnderstanding.refineGoal(parsedGoal, userAnswers);
    const refinedGoalText = refinedGoal.intent || goalText;

    await this.prisma.executionSession.update({
      where: { id: sessionId },
      data: { status: 'PLANNING' },
    });

    this.wsGateway.emitToSession(sessionId, 'clarification:resolved', {
      sessionId,
      refinedGoal,
      message: 'Goal clarified. Resuming planning...',
    });

    return { refinedGoal, goalText: refinedGoalText };
  }

  private async waitForAnswer(sessionId: string, timeoutMs: number): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const answer = await this.workerRelay.getClarificationAnswer(sessionId);
      if (answer) return answer;
      await new Promise((r) => setTimeout(r, 2000));
    }
    return null;
  }
}
