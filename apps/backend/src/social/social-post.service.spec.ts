import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SocialPostService } from './social-post.service';

const mockConfig = { get: jest.fn().mockReturnValue('sk-test-key') };

describe('SocialPostService', () => {
  let service: SocialPostService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialPostService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<SocialPostService>(SocialPostService);
  });

  describe('validateContent', () => {
    it('should reject empty content', () => {
      const result = service.validateContent('', 'twitter');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('empty');
    });

    it('should reject twitter content over 280 chars', () => {
      const long = 'x'.repeat(281);
      const result = service.validateContent(long, 'twitter');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('280');
    });

    it('should accept twitter content at 280 chars', () => {
      const result = service.validateContent('x'.repeat(280), 'twitter');
      expect(result.valid).toBe(true);
    });

    it('should reject linkedin content over 3000 chars', () => {
      const result = service.validateContent('x'.repeat(3001), 'linkedin');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('3000');
    });

    it('should accept linkedin content within limit', () => {
      const result = service.validateContent('x'.repeat(3000), 'linkedin');
      expect(result.valid).toBe(true);
    });

    it('should accept content for other platforms', () => {
      const result = service.validateContent('Hello world', 'facebook');
      expect(result.valid).toBe(true);
    });

    it('should accept content with exact boundaries', () => {
      expect(service.validateContent('a', 'twitter').valid).toBe(true);
      expect(service.validateContent('a', 'linkedin').valid).toBe(true);
    });
  });

  describe('calculateOptimalTime', () => {
    it('should return tomorrow at 9 AM', () => {
      const result = service.calculateOptimalTime('twitter');
      const now = new Date();
      expect(result.getDate()).toBe(now.getDate() + 1);
      expect(result.getHours()).toBe(9);
      expect(result.getMinutes()).toBe(0);
    });

    it('should be platform-independent', () => {
      const t1 = service.calculateOptimalTime('twitter');
      const t2 = service.calculateOptimalTime('linkedin');
      expect(t1.getTime()).toBe(t2.getTime());
    });
  });

  describe('generateDraft', () => {
    it('should return fallback when OpenAI fails', async () => {
      // Mock OpenAI constructor to return a client that throws
      const mockCreate = jest.fn().mockRejectedValue(new Error('API error'));
      (service as any).openai = { chat: { completions: { create: mockCreate } } };
      const result = await service.generateDraft('AI agents', 'twitter');
      expect(result).toContain('Autonomous AI agents');
    });
  });
});
