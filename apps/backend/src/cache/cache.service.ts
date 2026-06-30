import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import { CircuitBreaker } from '../common/circuit-breaker/circuit-breaker.decorator';

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  onModuleInit() {
    this.circuitBreakerService.register('redis', {
      failureThreshold: 3,
      cooldownMs: 15_000,
      timeoutMs: 5_000,
    });
    this.logger.log('Redis circuit breaker registered');
  }

  @CircuitBreaker('redis')
  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  @CircuitBreaker('redis')
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }

  @CircuitBreaker('redis')
  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  @CircuitBreaker('redis')
  async ping(): Promise<boolean> {
    const key = '__health_ping__';
    await this.set(key, 'ok', 5);
    const value = await this.get<string>(key);
    return value === 'ok';
  }
}
