//tasks.service.ts
import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto, TaskFilterDto } from './dto/task.dto';
import { QueueService } from '../queue/queue.service';
import { PlanningService } from '../planning/planning.service';
import { ExecutionService } from '../execution/execution.service';
import { CacheService } from '../cache/cache.service';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly planningService: PlanningService,
    private readonly executionService: ExecutionService,
    private readonly cache: CacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private taskCacheKey(userId: string, id: string): string {
    return `task:${userId}:${id}`;
  }

  private taskListCacheKey(userId: string, filter: TaskFilterDto): string {
    return `tasks:${userId}:${JSON.stringify(filter)}`;
  }

  /** CREATE → PLANNING → PLANNED → RUNNING → COMPLETED/FAILED */
  async create(userId: string, createTaskDto: CreateTaskDto) {
    const task = await this.planningService.generatePlan(
      createTaskDto.naturalLanguage,
      userId,
    );

    if (!task) {
      throw new Error('Failed to create task');
    }

    await this.prisma.task.update({
      where: { id: task.id },
      data: {
        title: createTaskDto.title || task.title,
        priority: createTaskDto.priority ?? task.priority,
        shadowMode: createTaskDto.shadowMode ?? task.shadowMode,
        context: createTaskDto.context ?? task.context,
      },
    });

    await Promise.all([
      this.queueService.addTaskJob('execute-after-plan', task.id, { userId }),
      this.cache.del(this.taskCacheKey(userId, task.id)),
    ]);

    const result = await this.findOne(userId, task.id);

    this.eventEmitter.emit('task.created', { userId, taskId: task.id, title: result.title });

    return result;
  }

  async findAll(userId: string, filter: TaskFilterDto = {}) {
    const cacheKey = this.taskListCacheKey(userId, filter);
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const { cursor, take, limit, offset } = filter;

    let result: any;

    if (cursor || take) {
      const pageSize = Math.min(take || limit || 20, 100);
      const decodedCursor = cursor
        ? (() => { try { return Buffer.from(cursor, 'base64url').toString('utf-8'); } catch { return undefined; } })()
        : undefined;

      const items = await this.prisma.task.findMany({
        take: pageSize + 1,
        skip: decodedCursor ? 1 : 0,
        cursor: decodedCursor ? { id: decodedCursor } : undefined,
        where: { userId, status: filter.status, priority: filter.priority },
        include: {
          plan: { select: { id: true, hash: true, validated: true } },
          executions: {
            orderBy: { startedAt: 'desc' },
            take: 1,
            select: { id: true, status: true, startedAt: true, completedAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const hasMore = items.length > pageSize;
      const data = hasMore ? items.slice(0, pageSize) : items;
      const last = data[data.length - 1];
      result = {
        data,
        nextCursor: last && hasMore ? Buffer.from(last.id, 'utf-8').toString('base64url') : null,
        hasMore,
      };
    } else {
      result = await this.prisma.task.findMany({
        where: { userId, status: filter.status, priority: filter.priority },
        include: {
          plan: { select: { id: true, hash: true, validated: true } },
          executions: {
            orderBy: { startedAt: 'desc' },
            take: 1,
            select: { id: true, status: true, startedAt: true, completedAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit || 50,
        skip: offset || 0,
      });
    }

    await this.cache.set(cacheKey, result, 30_000);
    return result;
  }

  async findOne(userId: string, id: string) {
    const cacheKey = this.taskCacheKey(userId, id);
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const task = await this.prisma.task.findFirst({
      where: { id, userId },
      include: {
        plan: true,
        executions: {
          orderBy: { startedAt: 'desc' },
          include: { steps: { orderBy: { stepIndex: 'asc' } } },
        },
      },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    await this.cache.set(cacheKey, task, 30_000);
    return task;
  }

  async execute(userId: string, id: string) {
    const task = await this.findOne(userId, id);
    if (!task.plan) {
      throw new NotFoundException('Task has no plan.');
    }
    const executionId = await this.executionService.executeTask(id, userId);
    return { message: 'Task queued for execution', taskId: id, executionId };
  }

  async update(userId: string, id: string, updateTaskDto: UpdateTaskDto) {
    await this.findOne(userId, id);
    const [result] = await Promise.all([
      this.prisma.task.update({ where: { id }, data: updateTaskDto }),
      this.cache.del(this.taskCacheKey(userId, id)),
    ]);
    this.eventEmitter.emit('task.updated', { userId, taskId: id, title: result.title });
    return result;
  }

  async cancel(userId: string, id: string) {
    await this.findOne(userId, id);
    const [result] = await Promise.all([
      this.prisma.task.update({
        where: { id },
        data: { status: TaskStatus.CANCELLED },
      }),
      this.cache.del(this.taskCacheKey(userId, id)),
    ]);
    this.eventEmitter.emit('task.cancelled', { userId, taskId: id });
    return result;
  }
}
