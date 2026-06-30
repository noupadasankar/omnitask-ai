import { Test, TestingModule } from '@nestjs/testing';
import { AgentRouterService } from './agent-router.service';
import { AgentRegistryService } from '../agent-registry/agent-registry.service';
import { PlannerAgentService } from './planner-agent.service';
import { ExecutionGraphService } from './runtime/execution-graph.service';
import { PreferenceMemoryService } from '../memory/preferences/preference-memory.service';
import { LearningEngineService } from '../learning/learning-engine.service';
import { CacheService } from '../cache/cache.service';

const mockAgentRegistry = {
  resolve: jest.fn(),
};

const mockPlanner = {
  createPlan: jest.fn(),
};

const mockGraphService = {
  graphFromLinearPlan: jest.fn(),
};

const mockPreferenceMemory = {
  getPreferences: jest.fn(),
  getPreferredForCategory: jest.fn(),
};

const mockLearningEngine = {
  getRankedSites: jest.fn(),
};

const mockCache = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key.startsWith('rankedSites')) return null;
    return null;
  }),
  set: jest.fn(),
};

function makeGoal(taskType: string) {
  return {
    taskType,
    intent: 'test',
    entities: {},
    constraints: [],
    preferredWebsites: [],
    estimatedComplexity: 'moderate' as const,
    requiresPayment: false,
    requiresLogin: false,
    sensitiveData: false,
    ambiguityScore: 0.3,
    clarifyingQuestions: [],
    confidence: 0.7,
  };
}

function makeBuildGraphResult(pluginIds: string[]) {
  return {
    plan: { taskId: 'task-1', goal: 'test', steps: [], estimatedDuration: 30, riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: false } },
    graph: { goal: 'test', domain: 'general', nodes: [], parallelBranches: [] },
    pluginIds,
    parallel: false,
  };
}

const mockDomainAgent = {
  id: 'food-agent',
  category: 'food' as const,
  buildGraph: jest.fn(),
};

describe('AgentRouterService', () => {
  let service: AgentRouterService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRouterService,
        { provide: AgentRegistryService, useValue: mockAgentRegistry },
        { provide: PlannerAgentService, useValue: mockPlanner },
        { provide: ExecutionGraphService, useValue: mockGraphService },
        { provide: PreferenceMemoryService, useValue: mockPreferenceMemory },
        { provide: LearningEngineService, useValue: mockLearningEngine },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();
    service = module.get<AgentRouterService>(AgentRouterService);
  });

  describe('route', () => {
    const context = {
      goal: 'Order pizza',
      userId: 'user-1',
    };

    it('should route via agent registry when agent is found', async () => {
      const goal = makeGoal('food_order');
      mockCache.get.mockResolvedValue(null);
      mockPreferenceMemory.getPreferences.mockResolvedValue({
        preferredJobSites: [], preferredFoodApps: [], preferredShoppingSites: [],
        preferredTravelSites: [], preferredEmailServices: [], preferredMediaServices: [],
      });
      mockCache.set.mockResolvedValue(undefined as any);
      mockAgentRegistry.resolve.mockReturnValue(mockDomainAgent);

      mockPreferenceMemory.getPreferredForCategory.mockReturnValue([]);
      mockLearningEngine.getRankedSites.mockResolvedValue([]);
      mockDomainAgent.buildGraph.mockResolvedValue(makeBuildGraphResult(['swiggy']));

      const result = await service.route(goal, context);

      expect(result.source).toBe('agent_registry');
      expect(result.domain).toBe('food');
      expect(result.agentId).toBe('food-agent');
      expect(result.matchedSkills).toEqual(['swiggy']);
    });

    it('should use planner fallback when no registry agent matches', async () => {
      const goal = makeGoal('general');
      mockCache.get.mockResolvedValue(null);
      mockPreferenceMemory.getPreferences.mockResolvedValue({
        preferredJobSites: [], preferredFoodApps: [], preferredShoppingSites: [],
        preferredTravelSites: [], preferredEmailServices: [], preferredMediaServices: [],
      });
      mockCache.set.mockResolvedValue(undefined as any);
      mockAgentRegistry.resolve.mockReturnValue(null);

      const plan = { taskId: 'task-1', goal: 'test', steps: [], estimatedDuration: 30, riskAssessment: { overallRisk: 'LOW' as const, reasons: [], requiresUserApproval: false } };
      mockPlanner.createPlan.mockResolvedValue(plan);
      mockGraphService.graphFromLinearPlan.mockReturnValue({ goal: 'test', domain: 'general', nodes: [], parallelBranches: [] });

      const result = await service.route(goal, context);

      expect(result.source).toBe('planner');
      expect(result.domain).toBe('general');
      expect(mockPlanner.createPlan).toHaveBeenCalled();
    });

    it('should load and cache user preferences', async () => {
      const goal = makeGoal('food_order');
      mockCache.get.mockResolvedValue(null);
      mockPreferenceMemory.getPreferences.mockResolvedValue({
        preferredJobSites: [], preferredFoodApps: ['swiggy'], preferredShoppingSites: [],
        preferredTravelSites: [], preferredEmailServices: [], preferredMediaServices: [],
      });
      mockCache.set.mockResolvedValue(undefined as any);
      mockAgentRegistry.resolve.mockReturnValue(mockDomainAgent);
      mockPreferenceMemory.getPreferredForCategory.mockReturnValue(['swiggy']);
      mockLearningEngine.getRankedSites.mockResolvedValue([]);
      mockDomainAgent.buildGraph.mockResolvedValue(makeBuildGraphResult(['swiggy']));

      await service.route(goal, context);

      expect(mockPreferenceMemory.getPreferences).toHaveBeenCalledWith('user-1');
      expect(mockCache.set).toHaveBeenCalledWith('prefs:user-1', expect.any(Object), 600_000);
    });

    it('should use cached preferences when available', async () => {
      const goal = makeGoal('food_order');
      const cachedPrefs = {
        preferredJobSites: [], preferredFoodApps: ['zomato'], preferredShoppingSites: [],
        preferredTravelSites: [], preferredEmailServices: [], preferredMediaServices: [],
      };
      mockCache.get.mockImplementation((key: string) => {
        if (key.startsWith('prefs:')) return cachedPrefs;
        return null;
      });
      mockAgentRegistry.resolve.mockReturnValue(mockDomainAgent);
      mockPreferenceMemory.getPreferredForCategory.mockReturnValue(['zomato']);
      mockLearningEngine.getRankedSites.mockResolvedValue([]);
      mockDomainAgent.buildGraph.mockResolvedValue(makeBuildGraphResult(['zomato']));

      await service.route(goal, context);

      expect(mockPreferenceMemory.getPreferences).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalledWith('prefs:user-1', expect.any(Object), 600_000);
    });

    it('should merge context user preferences with learned preferences', async () => {
      const goal = makeGoal('food_order');
      mockCache.get.mockResolvedValue(null);
      mockPreferenceMemory.getPreferences.mockResolvedValue({
        preferredJobSites: [], preferredFoodApps: ['swiggy'], preferredShoppingSites: [],
        preferredTravelSites: [], preferredEmailServices: [], preferredMediaServices: [],
      });
      mockCache.set.mockResolvedValue(undefined as any);
      mockAgentRegistry.resolve.mockReturnValue(mockDomainAgent);
      mockPreferenceMemory.getPreferredForCategory.mockReturnValue(['swiggy']);
      mockLearningEngine.getRankedSites.mockResolvedValue([]);
      mockDomainAgent.buildGraph.mockResolvedValue(makeBuildGraphResult(['swiggy']));

      const ctxWithPrefs = { ...context, userPreferences: { preferredFoodApps: ['zomato'] } as any };
      await service.route(goal, ctxWithPrefs);

      expect(mockDomainAgent.buildGraph).toHaveBeenCalledWith(
        goal,
        expect.objectContaining({
          userPreferences: expect.objectContaining({ preferredFoodApps: ['zomato'] }),
        }),
      );
    });
  });

  describe('inferDomain', () => {
    it('should map food_order to food', () => {
      expect(service.inferDomain(makeGoal('food_order'))).toBe('food');
    });

    it('should map shopping to shopping', () => {
      expect(service.inferDomain(makeGoal('shopping'))).toBe('shopping');
    });

    it('should map flight_search to travel', () => {
      expect(service.inferDomain(makeGoal('flight_search'))).toBe('travel');
    });

    it('should map research to research', () => {
      expect(service.inferDomain(makeGoal('research'))).toBe('research');
    });

    it('should map music_play to media', () => {
      expect(service.inferDomain(makeGoal('music_play'))).toBe('media');
    });

    it('should default to general for unknown types', () => {
      expect(service.inferDomain(makeGoal('unknown_type'))).toBe('general');
    });
  });

  describe('formatPreferenceSummary', () => {
    it('should format plugin labels from preferences', () => {
      mockPreferenceMemory.getPreferredForCategory.mockReturnValue(['linkedin-apply', 'naukri-search']);

      const result = service.formatPreferenceSummary(
        {} as any,
        'job',
      );

      expect(result).toEqual(['Linkedin', 'Naukri']);
    });
  });
});
