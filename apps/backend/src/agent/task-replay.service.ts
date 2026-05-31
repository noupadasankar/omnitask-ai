import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ReplayFrame {
  stepIndex: number;
  timestamp: number;
  action: string;
  target?: string;
  value?: string;
  screenshotUrl?: string;
  description: string;
  durationMs: number;
  status: string;
}

@Injectable()
export class TaskReplayService {
  private readonly logger = new Logger(TaskReplayService.name);

  constructor(private prisma: PrismaService) {}

  async getReplayData(sessionId: string): Promise<ReplayFrame[]> {
    this.logger.log(`Fetching replay visual ledger frames for session ${sessionId}`);

    const steps = await this.prisma.agentExecutionStep.findMany({
      where: { sessionId },
      orderBy: { stepIndex: 'asc' },
    });

    const screenshots = await this.prisma.screenshot.findMany({
      where: { sessionId },
      orderBy: { stepIndex: 'asc' },
    });

    const screenshotMap = new Map<number, string>();
    for (const shot of screenshots) {
      // Use raw base64 or thumbnail if image URL is empty
      const image = shot.imageUrl || shot.base64Thumbnail || '';
      if (shot.stepIndex !== null) {
        screenshotMap.set(shot.stepIndex, image);
      }
    }

    return steps.map((step: any) => ({
      stepIndex: step.stepIndex,
      timestamp: step.createdAt.getTime(),
      action: step.action,
      target: step.target || undefined,
      value: step.value || undefined,
      screenshotUrl: screenshotMap.get(step.stepIndex) || step.screenshotUrl || undefined,
      description: step.description,
      durationMs: step.durationMs || 0,
      status: step.status,
    }));
  }

  async getSessionTimeline(sessionId: string): Promise<any> {
    this.logger.log(`Compiling chronological event log metrics for session ${sessionId}`);

    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
      include: {
        screenshots: true,
        approvalRequests: true,
      },
    });

    if (!session) return null;

    const steps = await this.prisma.agentExecutionStep.findMany({
      where: { sessionId },
      orderBy: { stepIndex: 'asc' },
    });

    const timelineEvents: any[] = [];

    // Map plan steps
    for (const step of steps) {
      timelineEvents.push({
        id: `step_${step.stepIndex}`,
        timestamp: step.createdAt.getTime(),
        type: 'step',
        title: `Step ${step.stepIndex + 1}: ${step.action}`,
        description: step.description,
        status: step.status.toLowerCase(),
        metadata: {
          durationMs: step.durationMs,
          target: step.target,
          value: step.value,
          errorMessage: step.errorMessage,
        },
      });
    }

    // Map approval requests
    for (const app of session.approvalRequests) {
      timelineEvents.push({
        id: `approval_${app.id}`,
        timestamp: app.createdAt.getTime(),
        type: 'approval',
        title: 'Action Approval Required',
        description: app.description,
        status: app.status.toLowerCase(),
        metadata: {
          riskLevel: app.riskLevel,
          respondedAt: app.respondedAt,
          actionDetails: app.actionDetails,
        },
      });
    }

    // Map screenshots
    for (const shot of session.screenshots) {
      timelineEvents.push({
        id: `shot_${shot.id}`,
        timestamp: shot.timestamp.getTime(),
        type: 'screenshot',
        title: `Screenshot Capture (Step ${(shot.stepIndex ?? 0) + 1})`,
        description: 'Captured browser state viewport frame',
        status: 'completed',
        metadata: {
          imageUrl: shot.imageUrl || shot.base64Thumbnail,
          width: shot.width,
          height: shot.height,
        },
      });
    }

    // Sort events by timestamp
    timelineEvents.sort((a, b) => a.timestamp - b.timestamp);

    return {
      sessionId: session.id,
      goal: (session.metadata as any)?.goal || '',
      status: session.status,
      startedAt: session.createdAt.getTime(),
      completedAt: session.updatedAt.getTime(),
      totalSteps: session.totalSteps,
      currentStepIndex: session.currentStepIndex,
      timeline: timelineEvents,
    };
  }
}
