import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PolicyService } from './policy.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

const mockConfig = { get: jest.fn() };
const mockCircuitBreaker = {
  register: jest.fn(),
  isAllowed: jest.fn().mockReturnValue(true),
};

const defaultCtx = { userId: 'u1', role: 'user', tier: 'premium' as const, ip: '127.0.0.1', userAgent: 'test' };

describe('PolicyService', () => {
  let service: PolicyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: CircuitBreakerService, useValue: mockCircuitBreaker },
      ],
    }).compile();
    service = module.get<PolicyService>(PolicyService);
  });

  describe('evaluate', () => {
    it('should allow action for compliant user', () => {
      const result = service.evaluate(
        { ...defaultCtx, tier: 'premium' },
        'read',
        'documents',
      );
      expect(result.allowed).toBe(true);
      expect(result.complianceChecks).toHaveLength(3);
    });

    it('should require approval for HIGH risk actions', () => {
      const result = service.evaluate(
        { ...defaultCtx, tier: 'premium' },
        'update',
        'profile',
      );
      expect(result.requiresApproval).toBe(true);
    });

    it('should require approval for CRITICAL risk actions', () => {
      const result = service.evaluate(
        { ...defaultCtx, tier: 'premium' },
        'delete',
        'user',
      );
      expect(result.requiresApproval).toBe(true);
    });

    it('should flag PCI violation for free tier on payment data', () => {
      const result = service.evaluate(
        { ...defaultCtx, tier: 'free' },
        'write',
        'credit-card',
      );
      expect(result.violations).toBeDefined();
      expect(result.violations!.some((v) => v.includes('PCI'))).toBe(true);
    });

    it('should pass PCI for premium tier on payment data', () => {
      const result = service.evaluate(
        { ...defaultCtx, tier: 'premium' },
        'write',
        'credit-card',
      );
      expect(result.allowed).toBe(true);
    });

    it('should return LOW risk for unknown action', () => {
      const result = service.evaluate(
        { ...defaultCtx, tier: 'basic' },
        'unknown',
        'whatever',
      );
      expect(result.riskLevel).toBe('LOW');
    });
  });

  describe('assessRisk', () => {
    it('should return CRITICAL for delete actions', () => {
      const risk = (service as any).assessRisk('delete-account', 'users');
      expect(risk).toBe('CRITICAL');
    });

    it('should return CRITICAL for payment resources', () => {
      const risk = (service as any).assessRisk('read', 'payment-data');
      expect(risk).toBe('CRITICAL');
    });

    it('should return HIGH for create actions', () => {
      const risk = (service as any).assessRisk('create', 'items');
      expect(risk).toBe('HIGH');
    });

    it('should return MEDIUM for read actions', () => {
      const risk = (service as any).assessRisk('read', 'documents');
      expect(risk).toBe('MEDIUM');
    });

    it('should return LOW for innocuous actions', () => {
      const risk = (service as any).assessRisk('ping', 'health');
      expect(risk).toBe('LOW');
    });
  });

  describe('getRateLimitForTier', () => {
    it('should return correct limit for free tier', () => {
      const limit = service.getRateLimitForTier('free');
      expect(limit.maxRequests).toBe(30);
    });

    it('should return correct limit for admin tier', () => {
      const limit = service.getRateLimitForTier('admin');
      expect(limit.maxRequests).toBe(1000);
    });

    it('should default to free for unknown tier', () => {
      const limit = service.getRateLimitForTier('unknown' as any);
      expect(limit.maxRequests).toBe(30);
    });
  });

  describe('checkActionAllowed', () => {
    it('should allow normal action for any tier', async () => {
      const result = await service.checkActionAllowed('u1', 'premium', 'read');
      expect(result.allowed).toBe(true);
    });

    it('should block export for free tier', async () => {
      const result = await service.checkActionAllowed('u1', 'free', 'export');
      expect(result.allowed).toBe(false);
    });

    it('should allow export for basic tier', async () => {
      const result = await service.checkActionAllowed('u1', 'basic', 'export');
      expect(result.allowed).toBe(true);
    });

    it('should block admin action for non-admin tiers', async () => {
      const result = await service.checkActionAllowed('u1', 'premium', 'admin');
      expect(result.allowed).toBe(false);
    });

    it('should allow admin action for admin tier', async () => {
      const result = await service.checkActionAllowed('u1', 'admin', 'admin');
      expect(result.allowed).toBe(true);
    });

    it('should block when circuit breaker is open', async () => {
      mockCircuitBreaker.isAllowed.mockReturnValueOnce(false);
      const result = await service.checkActionAllowed('u1', 'premium', 'read');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('circuit');
    });
  });

  describe('checkCompliance', () => {
    it('should pass for non-sensitive resource', async () => {
      const result = await service.checkCompliance('free', 'documents');
      expect(result.passed).toBe(true);
    });

    it('should fail PCI for free tier on payment resource', async () => {
      const result = await service.checkCompliance('free', 'payment-data');
      expect(result.passed).toBe(false);
    });

    it('should pass PCI for basic tier on payment resource', async () => {
      const result = await service.checkCompliance('basic', 'payment-data');
      expect(result.passed).toBe(true);
    });

    it('should include GDPR detail for personal data', async () => {
      const result = await service.checkCompliance('free', 'personal-data');
      expect(result.details.some((d) => d.includes('GDPR'))).toBe(true);
    });
  });
});
