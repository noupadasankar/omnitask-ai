import { Test, TestingModule } from '@nestjs/testing';
import { ToolRouterService } from './tool-router.service';
import { BrowserAgentService } from './browser-agent.service';

describe('ToolRouterService', () => {
  let service: ToolRouterService;
  let browserAgent: any;

  beforeEach(async () => {
    browserAgent = {
      executeSkill: jest.fn(),
      executeAction: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolRouterService,
        { provide: BrowserAgentService, useValue: browserAgent },
      ],
    }).compile();
    service = module.get<ToolRouterService>(ToolRouterService);
  });

  describe('route', () => {
    it('should route navigate to NavigationSkill browser agent', () => {
      const route = service.route({
        index: 0, action: 'navigate', value: 'https://x.com',
        description: 'Go to site', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(route.agentType).toBe('browser');
      expect(route.skillName).toBe('NavigationSkill');
      expect(route.confidence).toBe(0.80);
      expect(route.args).toEqual({ url: 'https://x.com' });
    });

    it('should route type to FormFillSkill', () => {
      const route = service.route({
        index: 0, action: 'type', target: '#search', value: 'test',
        description: 'Type query', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(route.skillName).toBe('FormFillSkill');
      expect(route.args).toEqual({ selector: '#search', text: 'test' });
    });

    it('should route wait to NavigationSkill with timeout', () => {
      const route = service.route({
        index: 0, action: 'wait', value: '.result',
        description: 'Wait for results', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(route.skillName).toBe('NavigationSkill');
      expect(route.args).toEqual({ selector: '.result', timeoutMs: 10000 });
    });

    it('should route scroll with parsed pixels', () => {
      const route = service.route({
        index: 0, action: 'scroll', value: '1000',
        description: 'Scroll down', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(route.args).toEqual({ pixels: 1000 });
    });

    it('should route scroll with default pixels', () => {
      const route = service.route({
        index: 0, action: 'scroll',
        description: 'Scroll', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(route.args).toEqual({ pixels: 500 });
    });

    it('should route upload_file with selector and filePath', () => {
      const route = service.route({
        index: 0, action: 'upload_file', target: '#file', value: '/tmp/resume.pdf',
        description: 'Upload', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(route.args).toEqual({ selector: '#file', filePath: '/tmp/resume.pdf' });
    });

    it('should give 0.95 confidence when step has explicit matching skillName', () => {
      const route = service.route({
        index: 0, action: 'navigate', skillName: 'NavigationSkill', value: 'https://x.com',
        description: 'Go', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(route.confidence).toBe(0.95);
    });

    it('should give 0.60 confidence for unknown action', () => {
      const route = service.route({
        index: 0, action: 'unknown_action' as any,
        description: 'Unknown', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(route.confidence).toBe(0.60);
      expect(route.agentType).toBe('browser');
    });

    it('should fall back to browser for unknown agent type', () => {
      const route = service.route({
        index: 0, action: 'navigate',
        description: 'Go', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(route.agentName).toBe('BrowserAgent');
    });
  });

  describe('execute', () => {
    it('should execute browser skill when action maps to known skill', async () => {
      browserAgent.executeSkill.mockResolvedValue({ success: true, data: 'page loaded' });

      const result = await service.execute('session-1', {
        index: 0, action: 'navigate', value: 'https://x.com',
        description: 'Go', riskLevel: 'LOW', requiresApproval: false,
      });

      expect(browserAgent.executeSkill).toHaveBeenCalledWith('session-1', 'open_site', { url: 'https://x.com' });
      expect(result.success).toBe(true);
      expect(result.data).toBe('page loaded');
      expect(result.agentUsed).toBe('browser');
      expect(result.agentName).toBe('BrowserAgent');
    });

    it('should execute browser action when no skill mapping', async () => {
      browserAgent.executeAction.mockResolvedValue({ success: true });

      const result = await service.execute('session-1', {
        index: 0, action: 'hover', target: '.btn',
        description: 'Hover', riskLevel: 'LOW', requiresApproval: false,
      });

      expect(browserAgent.executeAction).toHaveBeenCalledWith('session-1', 'hover', '.btn', undefined);
      expect(result.success).toBe(true);
    });

    it('should return error result when execution throws', async () => {
      browserAgent.executeSkill.mockRejectedValue(new Error('Browser crashed'));

      const result = await service.execute('session-1', {
        index: 0, action: 'navigate', value: 'https://x.com',
        description: 'Go', riskLevel: 'LOW', requiresApproval: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Browser crashed');
      expect(result.agentUsed).toBe('browser');
    });

    it('should include screenshot in result when provided', async () => {
      browserAgent.executeSkill.mockResolvedValue({ success: true, screenshot: 'base64img' });

      const result = await service.execute('session-1', {
        index: 0, action: 'navigate', value: 'https://x.com',
        description: 'Go', riskLevel: 'LOW', requiresApproval: false,
      });

      expect(result.screenshot).toBe('base64img');
    });

    it('should report duration in result', async () => {
      browserAgent.executeSkill.mockResolvedValue({ success: true });

      const result = await service.execute('session-1', {
        index: 0, action: 'navigate', value: 'https://x.com',
        description: 'Go', riskLevel: 'LOW', requiresApproval: false,
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('describeRoute', () => {
    it('should return human-readable route description', () => {
      const desc = service.describeRoute({
        index: 0, action: 'navigate', value: 'https://x.com',
        description: 'Go', riskLevel: 'LOW', requiresApproval: false,
      });
      expect(desc).toContain('BrowserAgent');
      expect(desc).toContain('NavigationSkill');
      expect(desc).toContain('80%');
    });
  });

  describe('execute - error handling', () => {
    it('should handle execution via executeAction path', async () => {
      browserAgent.executeAction.mockResolvedValue({ success: true, data: 'done' });

      const result = await service.execute('session-1', {
        index: 0, action: 'hover', target: '.btn',
        description: 'Hover', riskLevel: 'LOW', requiresApproval: false,
      });

      expect(result.success).toBe(true);
      expect(result.agentUsed).toBe('browser');
    });
  });
});
