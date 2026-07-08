import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, PendingActionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { ExecutionEventBus } from '../event-bus/execution-event-bus.service';

export interface EditFields {
  [key: string]: unknown;
}

@Injectable()
export class ConfirmationService {
  private readonly logger = new Logger(ConfirmationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly eventBus: ExecutionEventBus,
  ) {}

  async listPending(userId: string) {
    const now = new Date();
    // Auto-expire stale records on read
    await this.prisma.pendingAction.updateMany({
      where: { userId, status: 'AWAITING_CONFIRMATION', expiresAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });

    return this.prisma.pendingAction.findMany({
      where: { userId, status: { in: ['AWAITING_CONFIRMATION', 'EDITED'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        actionType: true,
        summaryJson: true,
        editableFields: true,
        confidenceScore: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        taskId: true,
        sessionId: true,
      },
    });
  }

  async getOne(id: string, userId: string) {
    const action = await this.prisma.pendingAction.findUnique({ where: { id } });
    if (!action) throw new NotFoundException('PendingAction not found');
    if (action.userId !== userId) throw new ForbiddenException();
    return action;
  }

  async edit(id: string, userId: string, fields: EditFields) {
    const action = await this.getOne(id, userId);
    this.assertConfirmable(action);

    const updated = await this.prisma.pendingAction.update({
      where: { id },
      data: {
        status: PendingActionStatus.EDITED,
        summaryJson: this.mergeSummary(action.summaryJson as Record<string, unknown>, fields) as Prisma.InputJsonValue,
        rawPayloadJson: this.mergePayload(action.rawPayloadJson as Record<string, unknown>, fields) as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  async confirm(id: string, userId: string) {
    const action = await this.getOne(id, userId);
    this.assertConfirmable(action);

    await this.prisma.pendingAction.update({
      where: { id },
      data: { status: PendingActionStatus.CONFIRMED, confirmedAt: new Date() },
    });

    const payload = action.rawPayloadJson as Record<string, unknown>;
    const taskId = action.taskId ?? (payload.taskId as string | undefined);
    const sessionId = action.sessionId ?? (payload.sessionId as string | undefined);

    // Re-queue the task with the bypass flag so ConfirmationGateStage skips on re-run
    if (taskId) {
      await this.queueService.addTaskJob('execute-after-plan', taskId, {
        userId,
        skipConfirmationGate: true,
        pendingActionId: id,
        sessionId,
      });

      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: 'RUNNING' },
      });
    }

    if (sessionId) {
      this.eventBus.emit(sessionId, 'confirmation:confirmed', { pendingActionId: id, taskId });
    }

    this.logger.log(`PendingAction ${id} confirmed by user ${userId} — task ${taskId} re-queued`);
    return { success: true, taskId, pendingActionId: id };
  }

  async reject(id: string, userId: string) {
    const action = await this.getOne(id, userId);
    this.assertConfirmable(action);

    await this.prisma.pendingAction.update({
      where: { id },
      data: { status: PendingActionStatus.REJECTED, rejectedAt: new Date() },
    });

    const sessionId = action.sessionId ?? (action.rawPayloadJson as any)?.sessionId;
    if (sessionId) {
      this.eventBus.emit(sessionId, 'confirmation:rejected', { pendingActionId: id });
    }

    if (action.taskId) {
      await this.prisma.task.update({
        where: { id: action.taskId },
        data: { status: 'CANCELLED' },
      });
    }

    this.logger.log(`PendingAction ${id} rejected by user ${userId}`);
    return { success: true };
  }

  async writeReceipt(
    pendingActionId: string,
    userId: string,
    outcome: 'SUCCESS' | 'PARTIAL' | 'FAILED',
    details: Record<string, unknown>,
    notifiedVia: string[],
  ) {
    return this.prisma.executionReceipt.create({
      data: { pendingActionId, userId, outcome, detailsJson: details as Prisma.InputJsonValue, notifiedVia },
    });
  }

  private assertConfirmable(action: { status: PendingActionStatus; expiresAt: Date }) {
    if (new Date() > action.expiresAt) {
      throw new BadRequestException('This pending action has expired');
    }
    if (action.status === 'CONFIRMED') {
      throw new BadRequestException('Already confirmed');
    }
    if (action.status === 'REJECTED' || action.status === 'EXPIRED') {
      throw new BadRequestException(`Action is ${action.status.toLowerCase()} and cannot be modified`);
    }
  }

  private mergeSummary(
    existing: Record<string, unknown>,
    fields: EditFields,
  ): Record<string, unknown> {
    return { ...existing, editedFields: fields };
  }

  private mergePayload(
    existing: Record<string, unknown>,
    fields: EditFields,
  ): Record<string, unknown> {
    const parsedGoal = (existing.parsedGoal ?? {}) as Record<string, unknown>;
    const entities = ((parsedGoal.entities ?? {}) as Record<string, unknown>);
    return {
      ...existing,
      parsedGoal: { ...parsedGoal, entities: { ...entities, ...fields } },
    };
  }
}
