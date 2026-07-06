import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ItineraryBuilderService } from './itinerary-builder.service';

const mockConfig = { get: jest.fn().mockReturnValue('sk-test-key') };

describe('ItineraryBuilderService', () => {
  let service: ItineraryBuilderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItineraryBuilderService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<ItineraryBuilderService>(ItineraryBuilderService);
  });

  describe('build', () => {
    it('should return fallback itinerary when OpenAI fails', async () => {
      const mockCreate = jest.fn().mockRejectedValue(new Error('API error'));
      (service as any).openai = { chat: { completions: { create: mockCreate } } };
      const result = await service.build('Paris', 3, ['food', 'art']);
      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('day', 1);
      expect(result[0]).toHaveProperty('activities');
      expect(result[0].activities).toContain('Breakfast at local café');
    });

    it('should return fallback for 1 day', async () => {
      const mockCreate = jest.fn().mockRejectedValue(new Error('API error'));
      (service as any).openai = { chat: { completions: { create: mockCreate } } };
      const result = await service.build('Tokyo', 1);
      expect(result).toHaveLength(1);
    });

    it('should return fallback for many days', async () => {
      const mockCreate = jest.fn().mockRejectedValue(new Error('API error'));
      (service as any).openai = { chat: { completions: { create: mockCreate } } };
      const result = await service.build('London', 7);
      expect(result).toHaveLength(7);
    });

    it('should handle empty interests array', async () => {
      const mockCreate = jest.fn().mockRejectedValue(new Error('API error'));
      (service as any).openai = { chat: { completions: { create: mockCreate } } };
      const result = await service.build('NYC', 2, []);
      expect(result).toHaveLength(2);
    });

    it('should include destination in fallback activities', async () => {
      const mockCreate = jest.fn().mockRejectedValue(new Error('API error'));
      (service as any).openai = { chat: { completions: { create: mockCreate } } };
      const result = await service.build('Barcelona', 2);
      expect(result[0].activities.some((a: string) => a.includes('Barcelona'))).toBe(true);
    });

    it('should generate unique themes per day', async () => {
      const mockCreate = jest.fn().mockRejectedValue(new Error('API error'));
      (service as any).openai = { chat: { completions: { create: mockCreate } } };
      const result = await service.build('Rome', 3);
      expect(result[0].theme).toContain('Day 1');
      expect(result[1].theme).toContain('Day 2');
      expect(result[2].theme).toContain('Day 3');
    });
  });
});
