import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from '../common/llm/llm.service';
import { UserProfileMemoryService } from './user-profile-memory.service';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryStoreService } from './memory-store.service';

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

describe('UserProfileMemoryService', () => {
  let service: UserProfileMemoryService;
  let prisma: any;
  let memoryStore: jest.Mocked<Pick<MemoryStoreService, 'upsert'>>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      agentMemory: {
        findUnique: jest.fn(),
      },
    };
    memoryStore = { upsert: jest.fn().mockResolvedValue(undefined) } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserProfileMemoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: MemoryStoreService, useValue: memoryStore },
        { provide: LlmService, useValue: mockLlmService },
      ],
    }).compile();
    service = module.get<UserProfileMemoryService>(UserProfileMemoryService);
  });

  describe('saveProfileCard', () => {
    it('should merge addresses across calls', async () => {
      prisma.agentMemory.findUnique.mockResolvedValue({
        content: JSON.stringify({
          name: 'Alice', addresses: ['123 Main St'], resumes: [],
          paymentPreferences: {}, favoriteSites: [],
        }),
      });

      await service.saveProfileCard('user-1', { addresses: ['456 Oak Ave'] });

      const [id, , , , content] = (memoryStore.upsert as jest.Mock).mock.calls[0];
      expect(id).toBe('profile_card_user-1');
      const parsed = JSON.parse(content);
      expect(parsed.addresses).toEqual(['123 Main St', '456 Oak Ave']);
    });

    it('should merge and deduplicate arrays', async () => {
      prisma.agentMemory.findUnique.mockResolvedValue({
        content: JSON.stringify({
          name: 'Alice', addresses: ['123 Main St', '456 Oak Ave'],
          resumes: [], paymentPreferences: {}, favoriteSites: [],
        }),
      });

      await service.saveProfileCard('user-1', { addresses: ['456 Oak Ave', '789 Pine'] });

      const [, , , , content] = (memoryStore.upsert as jest.Mock).mock.calls[0];
      const parsed = JSON.parse(content);
      expect(parsed.addresses).toEqual(['123 Main St', '456 Oak Ave', '789 Pine']);
    });

    it('should merge payment preferences', async () => {
      prisma.agentMemory.findUnique.mockResolvedValue({
        content: JSON.stringify({
          name: 'Alice', addresses: [], resumes: [],
          paymentPreferences: { cardType: 'visa' }, favoriteSites: [],
        }),
      });

      await service.saveProfileCard('user-1', { paymentPreferences: { lastFour: '1234' } });

      const [, , , , content] = (memoryStore.upsert as jest.Mock).mock.calls[0];
      const parsed = JSON.parse(content);
      expect(parsed.paymentPreferences).toEqual({ cardType: 'visa', lastFour: '1234' });
    });

    it('should create new card when none exists', async () => {
      prisma.agentMemory.findUnique.mockResolvedValue(null);

      await service.saveProfileCard('user-1', { name: 'Bob', favoriteSites: ['github.com'] });

      expect(memoryStore.upsert).toHaveBeenCalledWith(
        'profile_card_user-1',
        'user-1',
        'SEMANTIC',
        'profile:card',
        expect.any(String),
        1.0,
      );
    });

    it('should call memoryStore.upsert with the profile card id', async () => {
      prisma.agentMemory.findUnique.mockResolvedValue({
        content: JSON.stringify({
          name: 'Alice', addresses: [], resumes: [],
          paymentPreferences: {}, favoriteSites: [],
        }),
      });

      await service.saveProfileCard('user-1', {});

      expect(memoryStore.upsert).toHaveBeenCalledWith(
        'profile_card_user-1',
        'user-1',
        'SEMANTIC',
        'profile:card',
        expect.any(String),
        1.0,
      );
    });

    it('should never call prisma.agentMemory directly for writes', async () => {
      prisma.agentMemory.findUnique.mockResolvedValue(null);
      // prisma mock has no upsert/create — if service called them it would throw
      await service.saveProfileCard('user-1', { name: 'Bob' });
      expect(memoryStore.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProfileCard', () => {
    it('should return parsed profile card', async () => {
      prisma.agentMemory.findUnique.mockResolvedValue({
        content: JSON.stringify({
          name: 'Alice', email: 'alice@x.com', addresses: ['123 Main St'],
          resumes: [], paymentPreferences: {}, favoriteSites: ['x.com'],
        }),
      });

      const card = await service.getProfileCard('user-1');
      expect(card.name).toBe('Alice');
      expect(card.email).toBe('alice@x.com');
      expect(card.addresses).toEqual(['123 Main St']);
    });

    it('should return default card when no memory exists', async () => {
      prisma.agentMemory.findUnique.mockResolvedValue(null);

      const card = await service.getProfileCard('user-1');
      expect(card.addresses).toEqual([]);
      expect(card.resumes).toEqual([]);
      expect(card.favoriteSites).toEqual([]);
    });

    it('should return default card on parse error', async () => {
      prisma.agentMemory.findUnique.mockResolvedValue({
        content: 'not-json',
      });

      const card = await service.getProfileCard('user-1');
      expect(card.addresses).toEqual([]);
    });
  });

  describe('autoLearnFromUserInteraction', () => {
    it('should extract and save profile info from user input', async () => {
      prisma.agentMemory.findUnique.mockResolvedValue({
        content: JSON.stringify({
          name: null, addresses: [], resumes: [],
          paymentPreferences: {}, favoriteSites: [],
        }),
      });

      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              extracted: {
                name: 'Alice', email: 'alice@x.com', addresses: [],
                favoriteSites: [], paymentPreferences: {},
              },
            }),
          },
        }],
      });

      await service.autoLearnFromUserInteraction('user-1', 'My name is Alice and my email is alice@x.com');

      const [, , , , content] = (memoryStore.upsert as jest.Mock).mock.calls[0];
      const parsed = JSON.parse(content);
      expect(parsed.name).toBe('Alice');
      expect(parsed.email).toBe('alice@x.com');
    });

    it('should skip save when LLM returns no extraction', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              extracted: { name: null, email: null, addresses: [], favoriteSites: [], paymentPreferences: {} },
            }),
          },
        }],
      });

      await service.autoLearnFromUserInteraction('user-1', 'Hello world');

      expect(memoryStore.upsert).not.toHaveBeenCalled();
    });

    it('should handle LLM failure gracefully', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValueOnce(new Error('API error'));

      await expect(service.autoLearnFromUserInteraction('user-1', 'test')).resolves.toBeUndefined();
    });

    it('should handle empty LLM response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: '' } }],
      });

      await expect(service.autoLearnFromUserInteraction('user-1', 'test')).resolves.toBeUndefined();
    });
  });
});
