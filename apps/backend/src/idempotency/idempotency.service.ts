import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly TTL_MS = 86_400_000; // 24 hours

  constructor(private readonly prisma: PrismaService) {}

  async getResponse(scopedKey: string) {
    const record = await this.prisma.idempotencyKey.findUnique({
      where: { id: scopedKey },
    });
    if (!record) return null;
    if (record.expiresAt < new Date()) {
      await this.prisma.idempotencyKey.delete({ where: { id: scopedKey } });
      return null;
    }
    return {
      statusCode: record.statusCode,
      body: record.response,
    };
  }

  async setResponse(
    scopedKey: string,
    userId: string,
    route: string,
    statusCode: number,
    response: unknown,
  ) {
    await this.prisma.idempotencyKey.upsert({
      where: { id: scopedKey },
      create: {
        id: scopedKey,
        userId,
        route,
        statusCode,
        response: response as any,
        expiresAt: new Date(Date.now() + this.TTL_MS),
      },
      update: {
        statusCode,
        response: response as any,
        expiresAt: new Date(Date.now() + this.TTL_MS),
      },
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanup() {
    const deleted = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (deleted.count > 0) {
      this.logger.log(`Cleaned up ${deleted.count} expired idempotency keys`);
    }
  }
}
