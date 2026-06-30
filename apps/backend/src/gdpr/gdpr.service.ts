import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async requestExport(userId: string) {
    const request = await this.prisma.dataExportRequest.create({
      data: { userId, status: 'PENDING', format: 'json' },
    });

    process.nextTick(() => this.processExport(request.id, userId));

    await this.auditService.log({
      userId, action: 'EXPORT_REQUESTED', resource: 'data-export', resourceId: request.id,
    });

    return request;
  }

  private async processExport(requestId: string, userId: string) {
    try {
      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: { status: 'PROCESSING' },
      });

      const [userData, userQuota, userPrefs, userTasks, userMemories, userFiles, userAuditLogs] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId } }),
        this.prisma.userQuota.findUnique({ where: { userId } }),
        this.prisma.userPreferences.findUnique({ where: { userId } }),
        this.prisma.task.findMany({ where: { userId }, take: 1000 }),
        this.prisma.memory.findMany({ where: { userId }, take: 1000 }),
        this.prisma.file.findMany({ where: { userId }, take: 1000, select: { id: true, name: true, mimeType: true, sizeBytes: true, createdAt: true } }),
        this.prisma.auditLog.findMany({ where: { userId }, take: 500 }),
      ]);

      if (!userData) return;

      const exportData = {
        exportedAt: new Date().toISOString(),
        user: {
          id: userData.id, email: userData.email, name: userData.name, role: userData.role,
          emailVerified: userData.emailVerified, createdAt: userData.createdAt,
        },
        quota: userQuota,
        preferences: userPrefs,
        tasks: userTasks,
        memories: userMemories,
        files: userFiles,
        auditLogs: userAuditLogs,
      };

      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: { status: 'COMPLETED', completedAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      });

      await this.auditService.log({
        userId, action: 'EXPORT_COMPLETED', resource: 'data-export', resourceId: requestId,
        metadata: { size: JSON.stringify(exportData).length },
      });

      this.logger.log(`Data export ${requestId} completed for user ${userId}`);
    } catch (err: any) {
      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: { status: 'FAILED' },
      }).catch(() => {});
      this.logger.error(`Data export ${requestId} failed: ${err.message}`);
    }
  }

  async getExports(userId: string) {
    return this.prisma.dataExportRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      take: 20,
    });
  }

  async requestDeletion(userId: string, reason?: string) {
    const existing = await this.prisma.dataDeletionRequest.findUnique({ where: { userId } });
    if (existing) throw new Error('Deletion already requested');

    const request = await this.prisma.dataDeletionRequest.create({
      data: { userId, reason, status: 'pending' },
    });

    await this.auditService.log({
      userId, action: 'DELETION_REQUESTED', resource: 'data-deletion', resourceId: request.id,
    });

    return request;
  }

  async anonymizeUser(userId: string) {
    const placeholder = `anonymized-${userId.slice(0, 8)}`;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: 'Anonymized User',
        email: `${placeholder}@anonymized.omnitask.ai`,
        passwordHash: null,
        avatarUrl: null,
        mfaSecret: null,
      },
    });

    await this.auditService.log({
      userId, action: 'ANONYMIZED', resource: 'user', resourceId: userId,
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async enforceRetentionPolicy() {
    this.logger.log('Running data retention policy enforcement');

    const policy = await this.prisma.dataRetentionPolicy.findFirst();
    if (!policy) return;

    const now = new Date();

    const auditCutoff = new Date(now.getTime() - policy.maxAuditLogAgeDays * 24 * 60 * 60 * 1000);
    await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: auditCutoff } },
    });

    const sessionCutoff = new Date(now.getTime() - policy.maxSessionAgeDays * 24 * 60 * 60 * 1000);
    await this.prisma.session.deleteMany({
      where: { createdAt: { lt: sessionCutoff } },
    });

    const memoryCutoff = new Date(now.getTime() - policy.maxMemoryAgeDays * 24 * 60 * 60 * 1000);
    await this.prisma.memory.deleteMany({
      where: { createdAt: { lt: memoryCutoff } },
    });

    const exportCutoff = new Date(now.getTime() - policy.maxExportFileAgeDays * 24 * 60 * 60 * 1000);
    await this.prisma.dataExportRequest.deleteMany({
      where: { completedAt: { lt: exportCutoff } },
    });

    const anonymizeCutoff = new Date(now.getTime() - policy.anonymizeAfterDays * 24 * 60 * 60 * 1000);
    const oldUsers = await this.prisma.user.findMany({
      where: { deletedAt: { lt: anonymizeCutoff }, email: { startsWith: 'deleted-' } },
      select: { id: true },
    });
    for (const user of oldUsers) {
      await this.anonymizeUser(user.id).catch(() => {});
    }

    this.logger.log(`Retention policy enforced: audit<${policy.maxAuditLogAgeDays}d, sessions<${policy.maxSessionAgeDays}d, memories<${policy.maxMemoryAgeDays}d`);
  }
}
