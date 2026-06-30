import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RiskLevel, ApprovalStatus } from '@prisma/client';
import { PolicyService } from '../common/policy/policy.service';

export interface ApprovalChallenge {
  id: string;
  sessionId: string;
  stepIndex: number;
  type: 'PAYMENT' | 'FORM_SUBMISSION' | 'EMAIL_SENDING' | 'ORDER_CONFIRMATION';
  description: string;
  amount?: number;
  metadata?: Record<string, any>;
}

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);
  private pendingResolvers = new Map<string, (approved: boolean) => void>();

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private policyService: PolicyService,
  ) {}

  async requestApproval(
    sessionId: string,
    stepIndex: number,
    type: 'PAYMENT' | 'FORM_SUBMISSION' | 'EMAIL_SENDING' | 'ORDER_CONFIRMATION',
    description: string,
    actionDetails: Record<string, any> = {},
    riskLevel: RiskLevel = RiskLevel.HIGH,
  ): Promise<boolean> {
    const id = `appr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`Initiating approval challenge: ${id} [${type}] for session ${sessionId}`);

    // Create database approval request
    await this.prisma.approvalRequest.create({
      data: {
        id,
        sessionId,
        stepIndex,
        riskLevel,
        description: `[${type}] ${description}`,
        actionDetails: {
          type,
          ...actionDetails,
        },
        status: ApprovalStatus.PENDING,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minute expiration
      },
    });

    const approvalPromise = new Promise<boolean>((resolve) => {
      this.pendingResolvers.set(id, resolve);
      
      // Auto-expire after 5 minutes
      setTimeout(() => {
        if (this.pendingResolvers.has(id)) {
          this.logger.warn(`Approval request ${id} expired.`);
          this.handleResponse(id, false);
        }
      }, 5 * 60 * 1000);
    });

    return approvalPromise;
  }

  async handleResponse(approvalId: string, approved: boolean, userId?: string): Promise<void> {
    const resolver = this.pendingResolvers.get(approvalId);
    if (!resolver) return;

    this.logger.log(`Approval response received for ${approvalId}: ${approved ? 'APPROVED' : 'DENIED'}`);

    await this.prisma.approvalRequest.update({
      where: { id: approvalId },
      data: {
        status: approved ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
        respondedAt: new Date(),
        respondedBy: userId || 'system',
      },
    });

    this.pendingResolvers.delete(approvalId);
    resolver(approved);
  }
}
