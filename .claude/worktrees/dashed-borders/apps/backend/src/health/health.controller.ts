import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
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

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      checks,
    };
  }
}
