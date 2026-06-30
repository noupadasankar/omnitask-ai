import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from '../common/llm/llm.service';
import { ExecutionMemoryService } from './execution-memory.service';
import { MemoryStoreService } from './memory-store.service';
import { AgentMemory } from '../shared/interfaces/agent.interfaces';

// Builds a complete AgentMemory from a partial, so mocks of
// MemoryStoreService.recall() (which returns AgentMemory[]) stay type-correct
// while a test only needs to specify the fields it cares about.
let _memSeq = 0;
function makeAgentMemory(partial: Partial<AgentMemory>): AgentMemory {
  return {
    id: `mem-${++_memSeq}`,
    userId: 'user-1',
    type: 'SEMANTIC',
    key: 'key',
    content: '',
    importance: 0.5,
    accessCount: 0,
    lastAccessedAt: null,
    expiresAt: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
};

const mockLlmService = {
  getClient: jest.fn(() => mockOpenAI),
  available: true,
  chatModel: 'llama-3.3-70b-versatile',
  miniModel: 'llama-3.1-8b-instant',
  visionModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
};

describe('ExecutionMemoryService', () => {
  let service: ExecutionMemoryService;
  let memoryStore: jest.Mocked<Pick<MemoryStoreService, 'store' | 'recall'>>;

  beforeEach(async () => {
    jest.clearAllMocks();
    memoryStore = {
      store: jest.fn(),
      recall: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionMemoryService,
        { provide: MemoryStoreService, useValue: memoryStore },
        { provide: LlmService, useValue: mockLlmService },
      ],
    }).compile();
    service = module.get<ExecutionMemoryService>(ExecutionMemoryService);
  });

  describe('savePreference', () => {
    it('should store preference as SEMANTIC memory', async () => {
      memoryStore.store.mockResolvedValue(undefined);

      await service.savePreference('user-1', 'preferredSeat', 'Window');

      expect(memoryStore.store).toHaveBeenCalledWith(
        'user-1', 'SEMANTIC', 'preference:preferredSeat',
        'The user prefers Window for preferredSeat.', 0.9,
      );
    });
  });

  describe('recallPreferences', () => {
    it('should return empty object when no memories found', async () => {
      memoryStore.recall.mockResolvedValue([]);

      const result = await service.recallPreferences('user-1', 'flight booking');
      expect(result).toEqual({});
    });

    it('should extract preferences from memories via LLM', async () => {
      memoryStore.recall.mockResolvedValue([
        makeAgentMemory({ content: 'The user prefers Window for preferredSeat.' }),
        makeAgentMemory({ content: 'The user prefers Biryani for preferredFood.' }),
      ]);
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              preferredSeat: 'Window', preferredFood: 'Biryani',
              priceSensitivity: 'medium',
            }),
          },
        }],
      });

      const result = await service.recallPreferences('user-1', 'flight booking');
      expect(result.preferredSeat).toBe('Window');
      expect(result.preferredFood).toBe('Biryani');
      expect(result.priceSensitivity).toBe('medium');
    });

    it('should handle LLM failure gracefully', async () => {
      memoryStore.recall.mockResolvedValue([
        makeAgentMemory({ content: 'The user prefers Window for preferredSeat.' }),
      ]);
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error('API error'));

      const result = await service.recallPreferences('user-1', 'flight');
      expect(result).toEqual({});
    });

    it('should handle empty LLM response', async () => {
      memoryStore.recall.mockResolvedValue([
        makeAgentMemory({ content: 'The user prefers Window for preferredSeat.' }),
      ]);
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: '' } }],
      });

      const result = await service.recallPreferences('user-1', 'flight');
      expect(result).toEqual({});
    });
  });

  describe('extractAndSavePreferencesFromGoal', () => {
    it('should extract and save preferences from goal text', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              extracted: [
                { key: 'preferredSeat', value: 'Window seat' },
                { key: 'preferredFood', value: 'Biryani' },
              ],
            }),
          },
        }],
      });
      memoryStore.store.mockResolvedValue(undefined);

      await service.extractAndSavePreferencesFromGoal('user-1', 'Book a flight with window seat and biryani');

      expect(memoryStore.store).toHaveBeenCalledTimes(2);
      expect(memoryStore.store).toHaveBeenCalledWith(
        'user-1', 'SEMANTIC', 'preference:preferredSeat',
        'The user prefers Window seat for preferredSeat.', 0.9,
      );
      expect(memoryStore.store).toHaveBeenCalledWith(
        'user-1', 'SEMANTIC', 'preference:preferredFood',
        'The user prefers Biryani for preferredFood.', 0.9,
      );
    });

    it('should skip save when no preferences extracted', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({ extracted: [] }),
          },
        }],
      });

      await service.extractAndSavePreferencesFromGoal('user-1', 'Hello');
      expect(memoryStore.store).not.toHaveBeenCalled();
    });

    it('should handle LLM failure gracefully', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error('API error'));

      await expect(service.extractAndSavePreferencesFromGoal('user-1', 'test')).resolves.toBeUndefined();
    });

    it('should handle empty LLM response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: '' } }],
      });

      await expect(service.extractAndSavePreferencesFromGoal('user-1', 'test')).resolves.toBeUndefined();
    });
  });
});
