import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';

const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockCircuitBreaker = {
  register: jest.fn(),
  isAllowed: jest.fn().mockReturnValue(true),
  onSuccess: jest.fn(),
  onFailure: jest.fn(),
};

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: CircuitBreakerService, useValue: mockCircuitBreaker },
      ],
    }).compile();
    service = module.get<CacheService>(CacheService);
  });

  describe('onModuleInit', () => {
    it('should register redis circuit breaker', () => {
      service.onModuleInit();
      expect(mockCircuitBreaker.register).toHaveBeenCalledWith('redis', expect.any(Object));
    });
  });

  describe('get', () => {
    it('should return cached value', async () => {
      mockCacheManager.get.mockResolvedValue('cached-data');
      const result = await service.get('my-key');
      expect(result).toBe('cached-data');
      expect(mockCacheManager.get).toHaveBeenCalledWith('my-key');
    });

    it('should return undefined for missing key', async () => {
      mockCacheManager.get.mockResolvedValue(undefined);
      const result = await service.get('missing');
      expect(result).toBeUndefined();
    });

    it('should support generic types', async () => {
      const obj = { foo: 1 };
      mockCacheManager.get.mockResolvedValue(obj);
      const result = await service.get<{ foo: number }>('obj-key');
      expect(result!.foo).toBe(1);
    });
  });

  describe('set', () => {
    it('should store value with default TTL', async () => {
      mockCacheManager.set.mockResolvedValue(undefined);
      await service.set('key', 'value');
      expect(mockCacheManager.set).toHaveBeenCalledWith('key', 'value', undefined);
    });

    it('should store value with custom TTL', async () => {
      mockCacheManager.set.mockResolvedValue(undefined);
      await service.set('key', { data: 42 }, 300);
      expect(mockCacheManager.set).toHaveBeenCalledWith('key', { data: 42 }, 300);
    });
  });

  describe('del', () => {
    it('should delete key', async () => {
      mockCacheManager.del.mockResolvedValue(undefined);
      await service.del('key-to-delete');
      expect(mockCacheManager.del).toHaveBeenCalledWith('key-to-delete');
    });
  });

  describe('ping', () => {
    it('should return true when cache is healthy', async () => {
      mockCacheManager.set.mockResolvedValue(undefined);
      mockCacheManager.get.mockResolvedValue('ok');
      const result = await service.ping();
      expect(result).toBe(true);
    });

    it('should return false when value mismatched', async () => {
      mockCacheManager.set.mockResolvedValue(undefined);
      mockCacheManager.get.mockResolvedValue('not-ok');
      const result = await service.ping();
      expect(result).toBe(false);
    });
  });
});
