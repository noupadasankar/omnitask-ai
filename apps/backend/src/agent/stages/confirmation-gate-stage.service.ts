import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PendingActionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionEventBus } from '../../event-bus/execution-event-bus.service';
import { ExecutionContext, PipelineExitReason } from './execution-context';
import { IExecutionStage } from './execution-stage.interface';

// Domain → actionType + expiry mapping
const DOMAIN_CONFIG: Record<string, { type: PendingActionType; expiryMs: number }> = {
  job: { type: PendingActionType.JOB_APPLICATION, expiryMs: 24 * 60 * 60 * 1000 },
  food: { type: PendingActionType.FOOD_ORDER, expiryMs: 30 * 60 * 1000 },
  shopping: { type: PendingActionType.PRODUCT_PURCHASE, expiryMs: 30 * 60 * 1000 },
  travel: { type: PendingActionType.TRAVEL_BOOKING, expiryMs: 60 * 60 * 1000 },
  social: { type: PendingActionType.SOCIAL_POST, expiryMs: 24 * 60 * 60 * 1000 },
  email: { type: PendingActionType.EMAIL_SEND, expiryMs: 24 * 60 * 60 * 1000 },
  calendar: { type: PendingActionType.CALENDAR_EVENT, expiryMs: 24 * 60 * 60 * 1000 },
};

// Domains that always need human confirmation before execution
const CONFIRMATION_REQUIRED_DOMAINS = new Set(Object.keys(DOMAIN_CONFIG));

// Risk levels that always need confirmation regardless of domain
const HIGH_RISK_LEVELS = new Set(['HIGH', 'CRITICAL']);

@Injectable()
export class ConfirmationGateStage implements IExecutionStage {
  private readonly logger = new Logger(ConfirmationGateStage.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: ExecutionEventBus,
  ) {}

  async execute(ctx: ExecutionContext): Promise<void> {
    // Bypass: re-run after user confirmed
    if (ctx.config?.skipConfirmationGate) return;

    const domain = ctx.routedDomain?.toLowerCase() ?? '';
    const risk = ctx.policyCheck?.overallRisk ?? 'LOW';

    const needsConfirmation =
      CONFIRMATION_REQUIRED_DOMAINS.has(domain) || HIGH_RISK_LEVELS.has(risk);

    if (!needsConfirmation) return;

    const domainCfg = DOMAIN_CONFIG[domain] ?? {
      type: PendingActionType.GENERAL_HIGH_RISK,
      expiryMs: 24 * 60 * 60 * 1000,
    };

    const summary = this.buildSummary(ctx, domain, risk);
    const editableFields = this.buildEditableFields(ctx, domain);
    const expiresAt = new Date(Date.now() + domainCfg.expiryMs);

    const pending = await this.prisma.pendingAction.create({
      data: {
        userId: ctx.userId!,
        taskId: ctx.taskId,
        sessionId: ctx.sessionId,
        actionType: domainCfg.type,
        summaryJson: summary as Prisma.InputJsonValue,
        rawPayloadJson: {
          goal: ctx.goal,
          sessionId: ctx.sessionId,
          taskId: ctx.taskId,
          parsedGoal: ctx.parsedGoal ? JSON.parse(JSON.stringify(ctx.parsedGoal)) : null,
          plan: ctx.plan ? JSON.parse(JSON.stringify(ctx.plan)) : null,
        } as Prisma.InputJsonValue,
        editableFields: editableFields as unknown as Prisma.InputJsonValue,
        confidenceScore: Math.round((ctx.systemConfidence ?? 0.8) * 100),
        expiresAt,
      },
    });

    this.logger.log(
      `ConfirmationGate: created PendingAction ${pending.id} (domain=${domain}, risk=${risk})`,
    );

    this.eventBus.emit(ctx.sessionId, 'confirmation:required', {
      pendingActionId: pending.id,
      domain,
      risk,
      summary,
      editableFields,
      confidenceScore: pending.confidenceScore,
      expiresAt: expiresAt.toISOString(),
    });

    // Update task status so the UI reflects "waiting for confirmation"
    if (ctx.taskId) {
      await this.prisma.task.update({
        where: { id: ctx.taskId },
        data: { status: 'AWAITING_APPROVAL' },
      });
    }

    ctx.exitReason = PipelineExitReason.PENDING_USER_CONFIRMATION;
  }

  private buildSummary(ctx: ExecutionContext, domain: string, risk: string): Record<string, unknown> {
    const plan = ctx.plan;
    const steps = plan?.steps ?? [];

    return {
      goal: ctx.goal,
      domain,
      risk,
      stepCount: steps.length,
      requiredApprovals: ctx.policyCheck?.requiresApprovalSteps ?? [],
      parsedEntities: ctx.parsedGoal?.entities ?? {},
      planSummary: steps.slice(0, 5).map((s: any) => s.description ?? s.action ?? String(s)),
    };
  }

  private buildEditableFields(ctx: ExecutionContext, domain: string): Record<string, unknown>[] {
    const entities = ctx.parsedGoal?.entities ?? {};

    const base: Record<string, unknown>[] = [];

    if (domain === 'job') {
      if (entities['role']) base.push({ key: 'role', label: 'Job Role', value: entities['role'], type: 'text' });
      if (entities['location']) base.push({ key: 'location', label: 'Location', value: entities['location'], type: 'text' });
      if (entities['count']) base.push({ key: 'count', label: 'Number of Applications', value: entities['count'], type: 'number', min: 1, max: 50 });
      base.push({ key: 'coverLetter', label: 'Cover Letter Tone', value: 'professional', type: 'select', options: ['professional', 'enthusiastic', 'concise'] });
    } else if (domain === 'food') {
      if (entities['restaurant']) base.push({ key: 'restaurant', label: 'Restaurant', value: entities['restaurant'], type: 'text' });
      if (entities['items']) base.push({ key: 'items', label: 'Items', value: entities['items'], type: 'text' });
      if (entities['address']) base.push({ key: 'address', label: 'Delivery Address', value: entities['address'], type: 'text' });
    } else if (domain === 'shopping') {
      if (entities['product']) base.push({ key: 'product', label: 'Product', value: entities['product'], type: 'text' });
      if (entities['budget']) base.push({ key: 'budget', label: 'Budget', value: entities['budget'], type: 'text' });
      if (entities['quantity']) base.push({ key: 'quantity', label: 'Quantity', value: entities['quantity'] ?? 1, type: 'number', min: 1 });
    } else if (domain === 'travel') {
      if (entities['destination']) base.push({ key: 'destination', label: 'Destination', value: entities['destination'], type: 'text' });
      if (entities['date']) base.push({ key: 'date', label: 'Travel Date', value: entities['date'], type: 'date' });
      if (entities['budget']) base.push({ key: 'budget', label: 'Budget', value: entities['budget'], type: 'text' });
    } else if (domain === 'social') {
      if (entities['platform']) base.push({ key: 'platform', label: 'Platform', value: entities['platform'], type: 'text' });
      if (entities['content']) base.push({ key: 'content', label: 'Post Content', value: entities['content'], type: 'textarea' });
    } else if (domain === 'email') {
      if (entities['to']) base.push({ key: 'to', label: 'To', value: entities['to'], type: 'text' });
      if (entities['subject']) base.push({ key: 'subject', label: 'Subject', value: entities['subject'], type: 'text' });
      if (entities['body']) base.push({ key: 'body', label: 'Body', value: entities['body'], type: 'textarea' });
    }

    return base;
  }
}
