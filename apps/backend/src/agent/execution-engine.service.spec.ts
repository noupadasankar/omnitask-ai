import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionEngineService } from './execution-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { BrowserAgentService } from './browser-agent.service';
import { PlannerAgentService } from './planner-agent.service';
import { VisionAgentService } from './vision-agent.service';
import { PolicyEngineService } from './policy-engine.service';
import { ScreenshotStreamerService } from './screenshot-streamer.service';
import { MemoryService } from '../memory/memory.service';
import { AgentGateway } from '../websocket/agent.gateway';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ToolRouterService } from './tool-router.service';
import { VerifierAgentService } from './verifier-agent.service';
import { StrategyMemoryService } from './strategy-memory.service';
import { GoalUnderstandingService } from './goal-understanding.service';
import { WorkerEventRelayService } from '../websocket/worker-event-relay.service';
import { SessionManagerService } from './runtime/session-manager.service';
import { ClarificationGateService } from './runtime/clarification-gate.service';
import { AutomationGateService } from './runtime/automation-gate.service';
import { WorkerDispatcherService } from './runtime/worker-dispatcher.service';
import { PlanOrchestratorService } from './runtime/plan-orchestrator.service';
import { WorldStateService } from './world-state.service';
import { DriftDetectorService } from './drift-detector.service';
import { ReflectionService } from './reflection.service';
import { ConfidenceNetworkService } from './confidence-network.service';
import { PreferenceMemoryService } from '../memory/preferences/preference-memory.service';

function mockService(methods: string[]) {
  const obj: any = {};
  for (const m of methods) obj[m] = jest.fn();
  return obj;
}

describe('ExecutionEngineService', () => {
  let service: ExecutionEngineService;
  let mockPrisma: any;
  let mockWsGateway: any;
  let mockSessionManager: any;
  let mockPolicyEngine: any;
  let mockToolRouter: any;
  let mockScreenshotStreamer: any;
  let mockBrowserAgent: any;
  let mockVisionAgent: any;
  let mockWorldState: any;
  let mockDriftDetector: any;
  let mockCpn: any;
  let mockPlanOrchestrator: any;
  let mockAutomationGate: any;
  let mockWorkerDispatcher: any;
  let mockMemory: any;
  let mockStrategyMemory: any;
  let mockPreferenceMemory: any;
  let mockVerifierAgent: any;
  let mockReflection: any;
  let mockEventEmitter: any;
  let mockClarificationGate: any;
  let mockPlannerAgent: any;
  let mockGoalUnderstanding: any;
  let mockWorkerRelay: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockPrisma = {
      executionSession: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      approvalRequest: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      memory: { create: jest.fn() },
    };
    mockWsGateway = mockService(['emitToSession']);
    mockSessionManager = {
      create: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
      allSessionIds: jest.fn().mockReturnValue([]),
      setGateState: jest.fn(),
      transitionBrowserState: jest.fn(),
    };
    mockPolicyEngine = {
      checkPlan: jest.fn().mockReturnValue({ approved: true, stepChecks: [], blockedSteps: [], overallRisk: 'LOW', requiresApprovalSteps: [] }),
      checkStep: jest.fn().mockReturnValue({ allowed: true, requiresApproval: false, riskLevel: 'LOW' }),
    };
    mockToolRouter = mockService(['execute', 'describeRoute']);
    mockScreenshotStreamer = mockService(['startStreaming', 'stopStreaming', 'captureAndEmit']);
    mockBrowserAgent = mockService(['createSession', 'closeSession', 'getSession', 'executeAction', 'executeSkill', 'takeScreenshot']);
    mockVisionAgent = mockService(['analyzeScreenshot', 'validateStepCompletion', 'detectBlockers']);
    mockWorldState = { initializeSession: jest.fn(), getState: jest.fn(), updateBelief: jest.fn(), removeSession: jest.fn() };
    mockDriftDetector = { initializeGoal: jest.fn(), evaluateDrift: jest.fn(), recordStep: jest.fn(), clearSession: jest.fn() };
    mockCpn = {
      initializeSession: jest.fn(), clearSession: jest.fn(), recordConfidence: jest.fn(),
      evaluateGate: jest.fn().mockReturnValue({ decision: 'proceed', systemConfidence: 0.9, reasoning: 'All clear', weakestNode: '', thresholds: { abortThreshold: 0.3, pauseThreshold: 0.5, warnThreshold: 0.7 } }),
      computeSystemConfidence: jest.fn().mockReturnValue({ systemConfidence: 0.85 }),
    };
    mockPlanOrchestrator = {
      buildExecutionPlan: jest.fn().mockResolvedValue({
        merged: { plan: { goal: 'test', steps: [{ index: 0, action: 'navigate', target: 'url', description: 'Go', requiresApproval: false, riskLevel: 'LOW' }] }, graph: {} },
        domain: 'general', matchedSkills: [],
      }),
    };
    mockAutomationGate = { evaluate: jest.fn().mockReturnValue({ proceed: true, requiresApproval: false, riskLevel: 'LOW', reason: '', targetDomains: [], triggers: [] }) };
    mockWorkerDispatcher = mockService(['dispatch']);
    mockMemory = mockService(['store']);
    mockStrategyMemory = mockService(['storeSuccessfulStrategy', 'storeFailurePattern']);
    mockPreferenceMemory = mockService(['autoLearn', 'getPreferences']);
    mockVerifierAgent = mockService(['verify']);
    mockReflection = mockService(['reflect']);
    mockEventEmitter = { once: jest.fn(), emit: jest.fn() };
    mockClarificationGate = { needsClarification: jest.fn().mockReturnValue(false), runGate: jest.fn() };
    mockPlannerAgent = mockService(['replanFromStep']);
    mockGoalUnderstanding = mockService(['parseGoal']);
    mockWorkerRelay = mockService(['relay']);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionEngineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BrowserAgentService, useValue: mockBrowserAgent },
        { provide: PlannerAgentService, useValue: mockPlannerAgent },
        { provide: VisionAgentService, useValue: mockVisionAgent },
        { provide: PolicyEngineService, useValue: mockPolicyEngine },
        { provide: ScreenshotStreamerService, useValue: mockScreenshotStreamer },
        { provide: MemoryService, useValue: mockMemory },
        { provide: AgentGateway, useValue: mockWsGateway },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ToolRouterService, useValue: mockToolRouter },
        { provide: VerifierAgentService, useValue: mockVerifierAgent },
        { provide: StrategyMemoryService, useValue: mockStrategyMemory },
        { provide: GoalUnderstandingService, useValue: mockGoalUnderstanding },
        { provide: WorkerEventRelayService, useValue: mockWorkerRelay },
        { provide: SessionManagerService, useValue: mockSessionManager },
        { provide: ClarificationGateService, useValue: mockClarificationGate },
        { provide: AutomationGateService, useValue: mockAutomationGate },
        { provide: WorkerDispatcherService, useValue: mockWorkerDispatcher },
        { provide: PlanOrchestratorService, useValue: mockPlanOrchestrator },
        { provide: WorldStateService, useValue: mockWorldState },
        { provide: DriftDetectorService, useValue: mockDriftDetector },
        { provide: ReflectionService, useValue: mockReflection },
        { provide: ConfidenceNetworkService, useValue: mockCpn },
        { provide: PreferenceMemoryService, useValue: mockPreferenceMemory },
      ],
    }).compile();

    service = module.get<ExecutionEngineService>(ExecutionEngineService);
    mockPrisma.executionSession.create.mockResolvedValue({ id: 'sess_1', userId: 'u1', taskId: 't1', status: 'PLANNING', currentStepIndex: 0, metadata: {} });
    mockPrisma.executionSession.findUnique.mockResolvedValue({ id: 'sess_1', userId: 'u1', taskId: 't1', status: 'PLANNING', metadata: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('startExecution', () => {
    it('should create execution session with PLANNING status', async () => {
      const sessionId = await service.startExecution('u1', 't1', 'test goal');
      expect(sessionId).toContain('exec_');
      expect(mockPrisma.executionSession.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', taskId: 't1', status: 'PLANNING' }),
      }));
    });

    it('should initialize COS runtime services', async () => {
      await service.startExecution('u1', 't1', 'test');
      expect(mockWorldState.initializeSession).toHaveBeenCalled();
      expect(mockDriftDetector.initializeGoal).toHaveBeenCalled();
      expect(mockCpn.initializeSession).toHaveBeenCalled();
      expect(mockSessionManager.create).toHaveBeenCalled();
    });

    it('should emit session:started event', async () => {
      await service.startExecution('u1', 't1', 'test');
      expect(mockWsGateway.emitToSession).toHaveBeenCalledWith(expect.any(String), 'session:started', expect.objectContaining({ profile: 'balanced' }));
    });

    it('should pass through clarification gate when needed', async () => {
      mockClarificationGate.needsClarification.mockReturnValue(true);
      mockClarificationGate.runGate.mockResolvedValue({ refinedGoal: { taskType: 'refined' }, goalText: 'refined goal' });
      await service.startExecution('u1', 't1', 'test', undefined, { taskType: 'general' } as any);
      expect(mockClarificationGate.needsClarification).toHaveBeenCalled();
    });

    it('should pass through clarification gate with null result gracefully', async () => {
      mockClarificationGate.needsClarification.mockReturnValue(true);
      mockClarificationGate.runGate.mockResolvedValue(null);
      const sessionId = await service.startExecution('u1', 't1', 'test', undefined, { taskType: 'general' } as any);
      expect(sessionId).toBeTruthy();
    });

    it('should set profile from config', async () => {
      await service.startExecution('u1', 't1', 'test', { profile: 'conservative' } as any);
      expect(mockSessionManager.create).toHaveBeenCalledWith(expect.any(String), 'conservative', undefined);
    });

    it('should emit initial WSO state', async () => {
      mockWorldState.getState.mockReturnValue({ stateConfidence: 0.9, beliefSourceConsensus: 0.85, version: 1, belief: new Map() });
      await service.startExecution('u1', 't1', 'test');
      expect(mockWsGateway.emitToSession).toHaveBeenCalledWith(expect.any(String), 'cos:world_state', expect.any(Object));
    });
  });

  describe('executeStep', () => {
    const baseStep = { index: 0, action: 'navigate', target: 'https://example.com', value: 'https://example.com', description: 'Navigate to site', requiresApproval: false, riskLevel: 'LOW' as any, waitCondition: undefined, fallback: undefined, validation: undefined };
    const basePlan = { goal: 'test', steps: [baseStep], estimatedDuration: 30, riskAssessment: { overallRisk: 'LOW', reasons: [], requiresUserApproval: false } };

    beforeEach(() => {
      mockToolRouter.execute.mockResolvedValue({ success: true, data: { page: 'loaded' } });
      mockScreenshotStreamer.captureAndEmit.mockResolvedValue('screenshot-data');
      mockVisionAgent.analyzeScreenshot.mockResolvedValue({ currentState: 'page loaded', confidence: 0.9 });
      mockVisionAgent.validateStepCompletion.mockResolvedValue({ completed: true, confidence: 0.95, description: 'OK' });
      mockVisionAgent.detectBlockers.mockResolvedValue({ hasBlocker: false });
      mockBrowserAgent.executeSkill.mockResolvedValue({ success: true, data: { detected: false } });
      mockWorldState.getState.mockReturnValue({ stateConfidence: 0.9, beliefSourceConsensus: 0.85, version: 1, belief: new Map(), history: {} });
    });

    it('should execute step and return success', async () => {
      const result = await (service as any).executeStep('sess_1', baseStep, basePlan);
      expect(result.success).toBe(true);
      expect(mockToolRouter.execute).toHaveBeenCalledWith('sess_1', baseStep);
    });

    it('should return failure when session not found', async () => {
      mockPrisma.executionSession.findUnique.mockResolvedValue(null);
      const result = await (service as any).executeStep('sess_1', baseStep, basePlan);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Session not found');
    });

    it('should block step via policy engine', async () => {
      mockPolicyEngine.checkStep.mockReturnValue({ allowed: false, requiresApproval: false, riskLevel: 'HIGH', reason: 'Blocked by policy' });
      const result = await (service as any).executeStep('sess_1', baseStep, basePlan);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should emit step:started and step:completed events', async () => {
      await (service as any).executeStep('sess_1', baseStep, basePlan);
      expect(mockWsGateway.emitToSession).toHaveBeenCalledWith('sess_1', 'step:started', expect.any(Object));
      expect(mockWsGateway.emitToSession).toHaveBeenCalledWith('sess_1', 'step:completed', expect.any(Object));
    });

    it('should handle approval-required step', async () => {
      const step = { ...baseStep, requiresApproval: true };
      mockPolicyEngine.checkStep.mockReturnValue({ allowed: true, requiresApproval: true, riskLevel: 'MEDIUM' });
      mockPrisma.approvalRequest.create.mockResolvedValue({ id: 'apr_1' });
      mockEventEmitter.once.mockImplementation((_event: string, cb: any) => { cb(true); return {}; });
      mockToolRouter.execute.mockResolvedValue({ success: true, data: {} });
      const result = await (service as any).executeStep('sess_1', step, basePlan);
      expect(result.success).toBe(true);
    });

    it('should fail when user denies approval', async () => {
      const step = { ...baseStep, requiresApproval: true };
      mockPolicyEngine.checkStep.mockReturnValue({ allowed: true, requiresApproval: true, riskLevel: 'MEDIUM' });
      mockPrisma.approvalRequest.create.mockResolvedValue({ id: 'apr_2' });
      mockEventEmitter.once.mockImplementation((_event: string, cb: any) => { cb(false); return {}; });
      const result = await (service as any).executeStep('sess_1', step, basePlan);
      expect(result.success).toBe(false);
      expect(result.error).toContain('denied');
    });

    it('should attempt fallback when validation fails with fallback defined', async () => {
      const step = { ...baseStep, fallback: { action: 'click', target: '#btn', value: '', description: 'Fallback' } as any };
      mockPrisma.approvalRequest.create.mockResolvedValue({ id: 'apr_fb', sessionId: 'sess_1', status: 'PENDING' });
      mockEventEmitter.once.mockImplementation((_event: string, cb: any) => { cb(true); return {}; });
      mockVisionAgent.validateStepCompletion.mockResolvedValue({ completed: false, confidence: 0.89, description: 'Not done' });
      mockVisionAgent.detectBlockers.mockResolvedValue({ hasBlocker: false });
      mockBrowserAgent.executeAction.mockResolvedValue({ success: true });
      const result = await (service as any).executeStep('sess_1', step, basePlan);
      expect(result.success).toBe(true);
      expect(mockBrowserAgent.executeAction).toHaveBeenCalled();
    });

    it('should fail when no fallback and validation fails', async () => {
      mockVisionAgent.validateStepCompletion.mockResolvedValue({ completed: false, confidence: 0.3, description: 'Not done' });
      const result = await (service as any).executeStep('sess_1', baseStep, basePlan);
      expect(result.success).toBe(false);
    });

    it('should handle wait condition with selector', async () => {
      const step = { ...baseStep, waitCondition: { type: 'selector' as any, value: '#button', timeoutMs: 30000 } };
      mockBrowserAgent.getSession.mockReturnValue(null);
      mockToolRouter.execute.mockResolvedValue({ success: true, data: {} });
      const result = await (service as any).executeStep('sess_1', step, basePlan);
      expect(result.success).toBe(true);
    });

    it('should trigger safety auto-pause on login detection', async () => {
      mockBrowserAgent.executeSkill.mockImplementation(async (_sid: string, skill: string) => {
        return skill === 'detect_login'
          ? { success: true, data: { detected: true, reasons: ['login form'], isLoginRequired: true } }
          : { success: true, data: { detected: false } };
      });
      mockPrisma.approvalRequest.create.mockResolvedValue({ id: 'apr_3' });
      mockEventEmitter.once.mockImplementation((_event: string, cb: any) => { cb(true); return {}; });
      await (service as any).executeStep('sess_1', baseStep, basePlan);
      expect(mockWorldState.updateBelief).toHaveBeenCalledWith('sess_1', 'authStatus', 'logging_in', 'DOM_DIRECT', 0.92);
    });

    it('should update session progress after step', async () => {
      await (service as any).executeStep('sess_1', baseStep, basePlan);
      expect(mockPrisma.executionSession.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ currentStepIndex: 1 }),
      }));
    });

    it('should emit step:failed when tool execution fails', async () => {
      mockToolRouter.execute.mockResolvedValue({ success: false, error: 'Navigation failed' });
      const result = await (service as any).executeStep('sess_1', baseStep, basePlan);
      expect(result.success).toBe(false);
      expect(mockWsGateway.emitToSession).toHaveBeenCalledWith('sess_1', 'step:failed', expect.any(Object));
    });
  });

  describe('handleApprovalResponse', () => {
    it('should approve and emit event', async () => {
      mockPrisma.approvalRequest.findUnique.mockResolvedValue({ id: 'apr_1', sessionId: 'sess_1', status: 'PENDING' });
      mockPrisma.approvalRequest.update.mockResolvedValue({});
      await service.handleApprovalResponse('apr_1', 'APPROVED');
      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED' }),
      }));
    });

    it('should reject invalid request', async () => {
      mockPrisma.approvalRequest.findUnique.mockResolvedValue(null);
      await expect(service.handleApprovalResponse('bad_id', 'APPROVED')).rejects.toThrow('Invalid');
    });

    it('should reject already-processed request', async () => {
      mockPrisma.approvalRequest.findUnique.mockResolvedValue({ id: 'apr_2', status: 'APPROVED' });
      await expect(service.handleApprovalResponse('apr_2', 'DENIED')).rejects.toThrow('Invalid');
    });

    it('should deny and still clear gate', async () => {
      mockPrisma.approvalRequest.findUnique.mockResolvedValue({ id: 'apr_3', sessionId: 'sess_1', status: 'PENDING' });
      await service.handleApprovalResponse('apr_3', 'DENIED');
      expect(mockSessionManager.setGateState).toHaveBeenCalledWith('sess_1', 'CLEARED');
    });
  });

  describe('pause / resume / cancel', () => {
    it('should pause execution', async () => {
      mockSessionManager.get.mockReturnValue({});
      await service.pauseExecution('sess_1');
      expect(mockScreenshotStreamer.stopStreaming).toHaveBeenCalledWith('sess_1');
      expect(mockSessionManager.transitionBrowserState).toHaveBeenCalledWith('sess_1', 'PAUSED');
    });

    it('should resume execution', async () => {
      mockSessionManager.get.mockReturnValue({});
      await service.resumeExecution('sess_1');
      expect(mockScreenshotStreamer.startStreaming).toHaveBeenCalledWith('sess_1', 500);
      expect(mockSessionManager.transitionBrowserState).toHaveBeenCalledWith('sess_1', 'RUNNING');
    });

    it('should cancel execution', async () => {
      mockSessionManager.get.mockReturnValue({ aborting: false });
      mockPrisma.executionSession.update.mockResolvedValue({});
      await service.cancelExecution('sess_1');
      expect(mockBrowserAgent.closeSession).toHaveBeenCalledWith('sess_1');
      expect(mockPrisma.executionSession.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }));
    });

    it('should release pending launch gate on cancel', async () => {
      mockSessionManager.get.mockReturnValue({});
      (service as any).pendingLaunchApprovals.set('sess_1', 'apr_1');
      await service.cancelExecution('sess_1');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('approval:apr_1', false);
    });
  });

  describe('attemptReplan', () => {
    const originalPlan = { goal: 'test', steps: [{ index: 0, action: 'navigate', description: 'Step 0' }], estimatedDuration: 30, riskAssessment: { overallRisk: 'LOW', reasons: [], requiresUserApproval: false } };

    it('should replan from failed step on vision analysis', async () => {
      (service as any).visionAgent = mockVisionAgent;
      mockVisionAgent.analyzeScreenshot.mockResolvedValue({ currentState: 'error page' });
      mockPlannerAgent.replanFromStep.mockResolvedValue([{ index: 1, action: 'click', description: 'Retry' }]);
      mockPrisma.executionSession.update.mockResolvedValue({});
      const result = await (service as any).attemptReplan('sess_1', originalPlan as any, 0, 'failed');
      expect(result).toBe(true);
      expect(mockPlannerAgent.replanFromStep).toHaveBeenCalled();
    });

    it('should return false when planner fails', async () => {
      mockPlannerAgent.replanFromStep.mockRejectedValue(new Error('Planner error'));
      const result = await (service as any).attemptReplan('sess_1', originalPlan as any, 0, 'failed');
      expect(result).toBe(false);
    });
  });

  describe('getSession / isActive', () => {
    it('should get session state', () => {
      mockSessionManager.get.mockReturnValue({ profile: 'balanced' });
      const state = service.getSession('sess_1');
      expect(state).toEqual({ profile: 'balanced' });
    });

    it('should return true for active session', () => {
      mockSessionManager.get.mockReturnValue({ aborting: false });
      expect(service.isActive('sess_1')).toBe(true);
    });

    it('should return false for aborted session', () => {
      mockSessionManager.get.mockReturnValue({ aborting: true });
      expect(service.isActive('sess_1')).toBe(false);
    });

    it('should return false for missing session', () => {
      mockSessionManager.get.mockReturnValue(undefined);
      expect(service.isActive('sess_1')).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should cancel all active sessions on shutdown', async () => {
      mockSessionManager.allSessionIds.mockReturnValue(['sess_1', 'sess_2']);
      mockSessionManager.get.mockReturnValue({});
      mockPrisma.executionSession.update.mockResolvedValue({});
      await service.onModuleDestroy();
      expect(mockPrisma.executionSession.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('runExecution (integration flow)', () => {
    it('should complete full execution flow via worker dispatcher', async () => {
      mockWorkerDispatcher.dispatch.mockResolvedValue(true);
      mockPrisma.executionSession.findUnique.mockResolvedValue({ id: 'sess_1', userId: 'u1', taskId: 't1', status: 'PLANNING', metadata: {} });
      await (service as any).runExecution('sess_1', 'test goal');
      expect(mockPlanOrchestrator.buildExecutionPlan).toHaveBeenCalled();
    });

    it('should handle python engine offline gracefully by catching error', async () => {
      mockWorkerDispatcher.dispatch.mockResolvedValue(false);
      mockPrisma.executionSession.findUnique.mockResolvedValue({ id: 'sess_1', userId: 'u1', taskId: 't1', status: 'PLANNING', metadata: {} });
      mockPlanOrchestrator.buildExecutionPlan.mockResolvedValue({
        merged: { plan: { goal: 'test', steps: [] }, graph: {} },
        domain: 'job', matchedSkills: ['skill-1'],
      });
      await expect((service as any).runExecution('sess_1', 'test goal')).resolves.toBeUndefined();
    });

    it('should update session with plan metadata after build', async () => {
      mockWorkerDispatcher.dispatch.mockResolvedValue(true);
      mockPrisma.executionSession.findUnique.mockResolvedValue({ id: 'sess_1', userId: 'u1', taskId: 't1', status: 'PLANNING', metadata: {} });
      await (service as any).runExecution('sess_1', 'test');
      expect(mockPrisma.executionSession.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ plan: expect.any(Object) }),
      }));
    });

    it('should emit plan:created event after building plan', async () => {
      mockWorkerDispatcher.dispatch.mockResolvedValue(true);
      mockPrisma.executionSession.findUnique.mockResolvedValue({ id: 'sess_1', userId: 'u1', taskId: 't1', status: 'PLANNING', metadata: {} });
      await (service as any).runExecution('sess_1', 'test');
      expect(mockWsGateway.emitToSession).toHaveBeenCalledWith('sess_1', 'plan:created', expect.any(Object));
    });

    it('should emit automation:gate after plan is built', async () => {
      mockWorkerDispatcher.dispatch.mockResolvedValue(true);
      mockPrisma.executionSession.findUnique.mockResolvedValue({ id: 'sess_1', userId: 'u1', taskId: 't1', status: 'PLANNING', metadata: {} });
      await (service as any).runExecution('sess_1', 'test');
      expect(mockWsGateway.emitToSession).toHaveBeenCalledWith('sess_1', 'automation:gate', expect.any(Object));
    });
  });
});
