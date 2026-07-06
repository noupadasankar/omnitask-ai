import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getSystemStats() {
    const [userCount, taskCount, sessionCount, memoryCount, fileCount, auditCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.task.count(),
      this.prisma.executionSession.count(),
      this.prisma.memory.count(),
      this.prisma.file.count(),
      this.prisma.auditLog.count(),
    ]);

    return {
      users: userCount,
      tasks: taskCount,
      sessions: sessionCount,
      memories: memoryCount,
      files: fileCount,
      auditLogs: auditCount,
    };
  }

  async listUsers(params: { skip: number; take: number; role?: string }) {
    const where: any = {};
    if (params.role) where.role = params.role;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true, email: true, name: true, role: true, emailVerified: true, createdAt: true,
          quota: { select: { plan: true, tasksPerDay: true, storageBytes: true, concurrentTasks: true } },
        },
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const data = users.map(u => ({
      ...u,
      quota: u.quota
        ? { plan: u.quota.plan, tasksPerDay: u.quota.tasksPerDay, storageBytes: Number(u.quota.storageBytes), concurrentTasks: u.quota.concurrentTasks }
        : null,
    }));

    return { data, total, skip: params.skip, take: params.take };
  }

  async updateUserRole(id: string, role: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const result = await this.prisma.user.update({
      where: { id },
      data: { role: role as any },
      select: { id: true, email: true, role: true },
    });

    await this.auditService.log({
      userId: id,
      action: 'ROLE_CHANGED',
      resource: 'user',
      resourceId: id,
      metadata: { newRole: role, oldRole: user.role },
    });

    return result;
  }

  async updateUserQuota(id: string, data: { plan?: string; tasksPerDay?: number; storageBytes?: number; concurrentTasks?: number }) {
    const updateData: any = {
      ...(data.plan && { plan: data.plan as any }),
      ...(data.tasksPerDay !== undefined && { tasksPerDay: data.tasksPerDay }),
      ...(data.storageBytes !== undefined && { storageBytes: BigInt(data.storageBytes) }),
      ...(data.concurrentTasks !== undefined && { concurrentTasks: data.concurrentTasks }),
    };

    const quota = await this.prisma.userQuota.upsert({
      where: { userId: id },
      update: updateData,
      create: {
        userId: id,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ...updateData,
      },
    });

    return {
      ...quota,
      storageBytes: Number(quota.storageBytes),
      storageUsedBytes: Number(quota.storageUsedBytes),
    };
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), email: `deleted-${id}@omnitask.ai` },
    });

    await this.auditService.log({
      userId: id,
      action: 'USER_DELETED',
      resource: 'user',
      resourceId: id,
    });

    return { deleted: true };
  }

  async getAuditLogs(params: { skip: number; take: number }) {
    return this.prisma.auditLog.findMany({
      skip: params.skip,
      take: params.take,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }
}
