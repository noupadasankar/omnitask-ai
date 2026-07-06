import { Test, TestingModule } from '@nestjs/testing';
import { PolicyEngineService } from './policy-engine.service';

describe('PolicyEngineService', () => {
  let service: PolicyEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PolicyEngineService],
    }).compile();
    service = module.get<PolicyEngineService>(PolicyEngineService);
  });

  describe('checkStep', () => {
    it('should allow safe steps', () => {
      const result = service.checkStep({
        index: 0, action: 'navigate', value: 'https://example.com',
        description: 'Go to site', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(result.allowed).toBe(true);
      expect(result.riskLevel).toBe('LOW');
    });

    it('should block banking domains', () => {
      const result = service.checkStep({
        index: 0, action: 'navigate', value: 'https://paypal.com/login',
        description: 'Go to PayPal', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('paypal.com');
    });

    it('should block localhost navigation', () => {
      const result = service.checkStep({
        index: 0, action: 'navigate', value: 'http://localhost:3000',
        description: 'Local dev', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('internal/local');
    });

    it('should block private IPs', () => {
      const result = service.checkStep({
        index: 0, action: 'navigate', value: 'http://192.168.1.1',
        description: 'Router', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(result.allowed).toBe(false);
    });

    it('should block invalid URLs', () => {
      const result = service.checkStep({
        index: 0, action: 'navigate', value: 'not-a-url',
        description: 'Bad URL', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(result.allowed).toBe(false);
    });

    it('should detect dangerous actions in description', () => {
      const result = service.checkStep({
        index: 0, action: 'click',
        description: 'Delete all records',
        riskLevel: 'LOW', requiresApproval: false,
      });
      expect(result.allowed).toBe(true);
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.requiresApproval).toBe(true);
    });

    it('should detect payment intent', () => {
      const result = service.checkStep({
        index: 0, action: 'click',
        description: 'Proceed to checkout and pay',
        riskLevel: 'LOW', requiresApproval: false,
      });
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.requiresApproval).toBe(true);
    });

    it('should block dangerous JavaScript patterns', () => {
      const result = service.checkStep({
        index: 0, action: 'evaluate', value: 'eval("alert(1)")',
        description: 'Run JS', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('eval');
    });

    it('should block document.cookie access', () => {
      const result = service.checkStep({
        index: 0, action: 'evaluate', value: 'document.cookie',
        description: 'Get cookies', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(result.allowed).toBe(false);
    });

    it('should flag file upload as HIGH', () => {
      const result = service.checkStep({
        index: 0, action: 'upload_file',
        description: 'Upload resume',
        riskLevel: 'LOW', requiresApproval: false,
      });
      expect(result.riskLevel).toBe('HIGH');
      expect(result.requiresApproval).toBe(true);
    });

    it('should block non-http protocols', () => {
      const result = service.checkStep({
        index: 0, action: 'navigate', value: 'file:///etc/passwd',
        description: 'File access', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(result.allowed).toBe(false);
    });

    it('should detect sensitive credentials actions', () => {
      const result = service.checkStep({
        index: 0, action: 'type', value: 'password123',
        description: 'Enter password',
        riskLevel: 'LOW', requiresApproval: false, target: '#password',
      });
      expect(result.riskLevel).toBe('HIGH');
      expect(result.requiresApproval).toBe(true);
    });
  });

  describe('checkPlan', () => {
    it('should approve a plan with no blocked steps', () => {
      const plan = {
        taskId: '', goal: 'test', estimatedDuration: 30,
        riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: false },
        steps: [
          { index: 0, action: 'navigate' as const, value: 'https://example.com', description: 'Go', riskLevel: 'LOW' as const, requiresApproval: false },
        ],
      };
      const result = service.checkPlan(plan);
      expect(result.approved).toBe(true);
      expect(result.blockedSteps).toEqual([]);
    });

    it('should reject plan with blocked steps', () => {
      const plan = {
        taskId: '', goal: 'test', estimatedDuration: 30,
        riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: false },
        steps: [
          { index: 0, action: 'navigate' as const, value: 'https://coinbase.com', description: 'Go to exchange', riskLevel: 'LOW' as const, requiresApproval: false },
        ],
      };
      const result = service.checkPlan(plan);
      expect(result.approved).toBe(false);
      expect(result.blockedSteps).toEqual([0]);
    });

    it('should aggregate highest risk level across steps', () => {
      const plan = {
        taskId: '', goal: 'test', estimatedDuration: 30,
        riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: false },
        steps: [
          { index: 0, action: 'navigate' as const, value: 'https://example.com', description: 'Safe', riskLevel: 'LOW' as const, requiresApproval: false },
          { index: 1, action: 'click' as const, description: 'Submit payment', riskLevel: 'LOW' as const, requiresApproval: false },
        ],
      };
      const result = service.checkPlan(plan);
      expect(result.overallRisk).toBe('CRITICAL');
    });

    it('should collect requiresApproval step indices', () => {
      const plan = {
        taskId: '', goal: 'test', estimatedDuration: 30,
        riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: false },
        steps: [
          { index: 0, action: 'navigate' as const, value: 'https://example.com', description: 'Safe', riskLevel: 'LOW' as const, requiresApproval: false },
          { index: 1, action: 'click' as const, description: 'Delete all records', riskLevel: 'LOW' as const, requiresApproval: false },
        ],
      };
      const result = service.checkPlan(plan);
      expect(result.requiresApprovalSteps).toContain(1);
    });
  });
});
