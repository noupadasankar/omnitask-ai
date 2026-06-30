import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalService } from './approval.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PolicyService } from '../common/policy/policy.service';
import { ApprovalStatus, RiskLevel } from '@prisma/client';

const mockPrisma = {
  approvalRequest: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockEventEmitter = {
  emit: jest.fn(),
};

const mockPolicyService = {
  evaluate: jest.fn(),
};

describe('ApprovalService', () => {
  let service: ApprovalService;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: PolicyService, useValue: mockPolicyService },
      ],
    }).compile();
    service = module.get<ApprovalService>(ApprovalService);
  });

  describe('requestApproval', () => {
    it('should create a PENDING approval request in database', async () => {
      mockPrisma.approvalRequest.create.mockResolvedValue({ id: 'appr_test' });
      service.requestApproval('session-1', 0, 'PAYMENT', 'Payment of $50');

      expect(mockPrisma.approvalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'session-1',
            stepIndex: 0,
            description: '[PAYMENT] Payment of $50',
            status: ApprovalStatus.PENDING,
          }),
        }),
      );

      jest.runAllTimers();
    });

    it('should include action details in the request', async () => {
      mockPrisma.approvalRequest.create.mockResolvedValue({ id: 'appr_test' });
      service.requestApproval('session-1', 1, 'FORM_SUBMISSION', 'Submit application',
        { formId: 'app-123' }, RiskLevel.CRITICAL);

      expect(mockPrisma.approvalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionDetails: { type: 'FORM_SUBMISSION', formId: 'app-123' },
            riskLevel: RiskLevel.CRITICAL,
          }),
        }),
      );

      jest.runAllTimers();
    });

    it('should set 5 minute expiration on the request', async () => {
      mockPrisma.approvalRequest.create.mockResolvedValue({ id: 'appr_test' });
      service.requestApproval('session-1', 0, 'EMAIL_SENDING', 'Send email');

      const createCall = mockPrisma.approvalRequest.create.mock.calls[0][0];
      const expiresAt = new Date(createCall.data.expiresAt).getTime();
      const expectedExpiry = Date.now() + 5 * 60 * 1000;
      expect(expiresAt - expectedExpiry).toBeLessThan(100);

      jest.runAllTimers();
    });
  });

  describe('handleResponse', () => {
    it('should update approval request to APPROVED', async () => {
      let approved = false;
      (service as any).pendingResolvers.set('test-id', (val: boolean) => { approved = val; });

      await service.handleResponse('test-id', true, 'user-1');

      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: { status: ApprovalStatus.APPROVED, respondedAt: expect.any(Date), respondedBy: 'user-1' },
      });
      expect(approved).toBe(true);
    });

    it('should update approval request to REJECTED', async () => {
      let approved = true;
      (service as any).pendingResolvers.set('test-id', (val: boolean) => { approved = val; });

      await service.handleResponse('test-id', false);

      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: { status: ApprovalStatus.REJECTED, respondedAt: expect.any(Date), respondedBy: 'system' },
      });
      expect(approved).toBe(false);
    });

    it('should be no-op for unknown approval id', async () => {
      await service.handleResponse('nonexistent', true);
      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should set respondedBy to system when userId not provided', async () => {
      (service as any).pendingResolvers.set('sys-test', jest.fn());

      await service.handleResponse('sys-test', true);

      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'sys-test' },
        data: expect.objectContaining({ respondedBy: 'system' }),
      });
    });
  });
});
