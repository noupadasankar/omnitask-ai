import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ArtifactStoreService } from '../digital-twin/artifact-store.service';
import { asRecord, extractDomain, toJobStatus } from './worker-event.utils';

interface WorkerEventPayload {
  sessionId: string;
  event: string;
  data: Record<string, any>;
  timestamp: number;
}

@Injectable()
export class WorkerDataHandler {
  private readonly logger = new Logger(WorkerDataHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly artifactStore: ArtifactStoreService,
  ) {}

  async handleAgentResult(payload: WorkerEventPayload): Promise<void> {
    const kind = String(payload.data.kind || 'result');
    const items = Array.isArray(payload.data.items) ? payload.data.items : [];
    if (items.length === 0) return;

    const session = await this.prisma.executionSession.findUnique({
      where: { id: payload.sessionId },
      select: { userId: true, metadata: true },
    });
    if (!session?.userId) return;

    const goal =
      (asRecord(session.metadata)?.goal as string) || 'Agent result';

    await this.artifactStore.record({
      userId: session.userId,
      sessionId: payload.sessionId,
      agent: kind,
      kind: 'RESULT_SET',
      title: `${kind}: ${goal}`.slice(0, 180),
      mimeType: 'application/json',
      data: { kind, count: items.length, items },
      tags: [kind],
    });
  }

  async handleApplicationResult(payload: WorkerEventPayload): Promise<void> {
    const d = payload.data || {};
    const userId =
      (typeof d.userId === 'string' && d.userId) ||
      (await this.lookupUserId(payload.sessionId));
    const portal = typeof d.portal === 'string' ? d.portal : null;
    const externalJobId = d.externalJobId ? String(d.externalJobId) : null;
    if (!userId || !portal || !externalJobId) {
      this.logger.warn(
        `[DataHandler] application:result missing keys (user=${!!userId} portal=${portal} jobId=${externalJobId})`,
      );
      return;
    }

    const status = toJobStatus(d.status);
    const reasons = Array.isArray(d.matchReasons) ? d.matchReasons : [];
    const base = {
      title: typeof d.title === 'string' ? d.title : 'Unknown role',
      company: typeof d.company === 'string' ? d.company : null,
      location: typeof d.location === 'string' ? d.location : null,
      url: typeof d.url === 'string' ? d.url : null,
      score: Number.isFinite(Number(d.score)) ? Number(d.score) : 0,
      matchReasons: reasons as unknown as Prisma.InputJsonValue,
      status,
      sessionId: payload.sessionId,
      errorMessage: typeof d.error === 'string' ? d.error : null,
      ...(status === 'APPLIED'
        ? { appliedAt: new Date(payload.timestamp) }
        : {}),
    };

    await this.prisma.jobApplication
      .upsert({
        where: { userId_portal_externalJobId: { userId, portal, externalJobId } },
        update: base,
        create: { userId, portal, externalJobId, ...base },
      })
      .catch((err) =>
        this.logger.warn(`[DataHandler] application:result upsert failed: ${err.message}`),
      );
  }

  async handleTrajectoryStep(payload: WorkerEventPayload): Promise<void> {
    const d = payload.data || {};
    const stepIndex = Number(d.stepIndex);
    if (!Number.isFinite(stepIndex)) return;
    const userId =
      (typeof d.userId === 'string' && d.userId) ||
      (await this.lookupUserId(payload.sessionId));

    const asJson = (v: unknown): Prisma.InputJsonValue | undefined =>
      v && typeof v === 'object' ? (v as Prisma.InputJsonValue) : undefined;

    const data = {
      userId,
      goal: typeof d.goal === 'string' ? d.goal.slice(0, 1000) : null,
      domain: typeof d.domain === 'string' ? d.domain : null,
      url: typeof d.url === 'string' ? d.url.slice(0, 1000) : null,
      observation: typeof d.observation === 'string' ? d.observation : null,
      decision: asJson(d.decision),
      tool: typeof d.tool === 'string' ? d.tool : null,
      actionResult:
        typeof d.actionResult === 'string' ? d.actionResult.slice(0, 2000) : null,
      confidence: Number.isFinite(Number(d.confidence)) ? Number(d.confidence) : null,
      risk: Number.isFinite(Number(d.risk)) ? Number(d.risk) : null,
      screenshotRef: typeof d.screenshotRef === 'string' ? d.screenshotRef : null,
    };

    await this.prisma.trajectoryStep
      .upsert({
        where: {
          sessionId_stepIndex: { sessionId: payload.sessionId, stepIndex },
        },
        update: data,
        create: { sessionId: payload.sessionId, stepIndex, ...data },
      })
      .catch((err) =>
        this.logger.debug(`[DataHandler] trajectory:step persist failed: ${err.message}`),
      );
  }

  private async lookupUserId(sessionId: string): Promise<string | null> {
    const session = await this.prisma.executionSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    return session?.userId || null;
  }
}
