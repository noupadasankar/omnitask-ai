import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

export interface WebhookEvent {
  event: string;
  userId: string;
  payload: unknown;
  timestamp: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, data: { url: string; secret?: string; events: string[]; retryCount?: number; timeoutMs?: number }) {
    return this.prisma.webhook.create({
      data: {
        userId,
        url: data.url,
        secret: data.secret,
        events: data.events,
        retryCount: data.retryCount ?? 3,
        timeoutMs: data.timeoutMs ?? 10000,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.webhook.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    return this.prisma.webhook.findFirst({
      where: { id, userId, deletedAt: null },
    });
  }

  async update(userId: string, id: string, data: { url?: string; secret?: string; events?: string[]; enabled?: boolean; retryCount?: number; timeoutMs?: number }) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!webhook) return null;
    return this.prisma.webhook.update({ where: { id }, data });
  }

  async remove(userId: string, id: string) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!webhook) return null;
    return this.prisma.webhook.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async deliver(event: WebhookEvent) {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        userId: event.userId,
        enabled: true,
        deletedAt: null,
        events: { has: event.event },
      },
    });

    if (webhooks.length === 0) return;

    const body = JSON.stringify(event);
    const results = await Promise.allSettled(
      webhooks.map(async (webhook) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'Omnitask-Webhook/1.0',
          'X-Webhook-Event': event.event,
          'X-Webhook-Id': webhook.id,
        };
        if (webhook.secret) {
          headers['X-Webhook-Signature'] = await this.sign(body, webhook.secret);
        }

        for (let attempt = 1; attempt <= webhook.retryCount; attempt++) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), webhook.timeoutMs);
            const res = await fetch(webhook.url, {
              method: 'POST',
              headers,
              body,
              signal: controller.signal,
            });
            clearTimeout(timer);

            if (res.ok) {
              await this.prisma.webhook.update({
                where: { id: webhook.id },
                data: { lastStatus: 'success', lastTriggeredAt: new Date() },
              });
              this.logger.log(`Webhook ${webhook.id} delivered: ${event.event}`);
              return;
            }
            this.logger.warn(`Webhook ${webhook.id} attempt ${attempt} returned ${res.status}`);
          } catch (err: any) {
            this.logger.warn(`Webhook ${webhook.id} attempt ${attempt} failed: ${err.message}`);
          }
          if (attempt < webhook.retryCount) {
            await this.delay(Math.min(1000 * Math.pow(2, attempt - 1), 30000));
          }
        }

        await this.prisma.webhook.update({
          where: { id: webhook.id },
          data: { lastStatus: 'failed', lastTriggeredAt: new Date() },
        });
        this.logger.error(`Webhook ${webhook.id} permanently failed after ${webhook.retryCount} attempts`);
      }),
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanup() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await this.prisma.webhook.updateMany({
      where: { deletedAt: { lt: thirtyDaysAgo } },
      data: { deletedAt: thirtyDaysAgo },
    });
  }

  private async sign(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
