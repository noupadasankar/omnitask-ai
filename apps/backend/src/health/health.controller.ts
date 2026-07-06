import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  @Get()
  async getHealth() {
    const checks: Record<string, { status: string; latencyMs?: number }> = {};
    let overall = 'healthy';

    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'up', latencyMs: Date.now() - dbStart };
    } catch {
      checks.database = { status: 'down' };
      overall = 'degraded';
    }

    const cacheStart = Date.now();
    try {
      await this.cache.ping();
      checks.redis = { status: 'up', latencyMs: Date.now() - cacheStart };
    } catch {
      checks.redis = { status: 'down' };
      overall = 'degraded';
    }

    // Python agent service health check
    const pythonUrl = process.env.PYTHON_AGENT_URL || 'http://localhost:8000';
    const pyStart = Date.now();
    try {
      const res = await fetch(`${pythonUrl}/health`, { signal: AbortSignal.timeout(5000) });
      checks.python_agent = { status: res.ok ? 'up' : 'down', latencyMs: Date.now() - pyStart };
      if (!res.ok) overall = 'degraded';
    } catch {
      checks.python_agent = { status: 'down' };
      overall = 'degraded';
    }

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      checks,
      circuitBreakers: this.circuitBreakerService.getAllStates().map((b) => ({
        name: b.name,
        state: b.state,
        failureCount: b.failureCount,
        cooldownEndsAt: b.cooldownEndsAt,
      })),
    };
  }
}
