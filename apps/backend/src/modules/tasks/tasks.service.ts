import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskStatus } from './enums/task-status.enum';
import { WsGateway } from '../../shared/websocket/ws.gateway';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('tasks') private readonly taskQueue: Queue,
    private readonly ws: WsGateway,
  ) {}

  async create(userId: string, dto: CreateTaskDto) {
    const task = await this.prisma.task.create({
      data: { userId, rawInput: dto.rawInput, shadowMode: dto.shadowMode ?? false, status: TaskStatus.QUEUED },
    });

    const job = await this.taskQueue.add('execute-task', { taskId: task.id, userId }, {
      jobId: task.id,
      priority: dto.priority ?? 5,
      delay: dto.scheduleAt ? new Date(dto.scheduleAt).getTime() - Date.now() : 0,
    });

    this.logger.log(`Task ${task.id} queued (job: ${job.id})`);
    this.ws.emitToUser(userId, 'task:created', { taskId: task.id, status: TaskStatus.QUEUED });
    return task;
  }

  async findAll(userId: string, page = 1, limit = 20, status?: TaskStatus) {
    const where = { userId, ...(status && { status }) };
    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          steps: { orderBy: { index: 'asc' }, select: { id: true, index: true, action: true, result: true, error: true, screenshotUrl: true, executedAt: true } },
          _count: { select: { files: true, approvals: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(userId: string, taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { steps: { orderBy: { index: 'asc' } }, approvals: true, files: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.userId !== userId) throw new ForbiddenException();
    return task;
  }

  async cancel(userId: string, taskId: string) {
    const task = await this.findOne(userId, taskId);
    if ([TaskStatus.DONE, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(task.status as any)) {
      throw new ForbiddenException(`Cannot cancel task in status: ${task.status}`);
    }
    await this.taskQueue.remove(taskId).catch(() => {});
    const updated = await this.prisma.task.update({ where: { id: taskId }, data: { status: TaskStatus.CANCELLED } });
    this.ws.emitToUser(userId, 'task:cancelled', { taskId });
    return updated;
  }

  async updateStatus(taskId: string, status: TaskStatus, extra?: { errorMessage?: string; planHash?: string; plan?: any }) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        ...(extra?.errorMessage && { errorMessage: extra.errorMessage }),
        ...(extra?.planHash && { planHash: extra.planHash }),
        ...(extra?.plan && { plan: extra.plan }),
        ...(status === TaskStatus.RUNNING && { startedAt: new Date() }),
        ...([TaskStatus.DONE, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(status) && { completedAt: new Date() }),
      },
    });
  }

  async getStats(userId: string) {
    const [total, done, failed, running] = await Promise.all([
      this.prisma.task.count({ where: { userId } }),
      this.prisma.task.count({ where: { userId, status: TaskStatus.DONE } }),
      this.prisma.task.count({ where: { userId, status: TaskStatus.FAILED } }),
      this.prisma.task.count({ where: { userId, status: TaskStatus.RUNNING } }),
    ]);
    return { total, done, failed, running, successRate: total > 0 ? Math.round((done / total) * 100) : 0 };
  }
}