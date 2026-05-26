import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto, TaskFilterDto } from './dto/task.dto';
import { QueueService } from '../queue/queue.service';
import { PlanningService } from '../planning/planning.service';
import { ExecutionService } from '../execution/execution.service';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly planningService: PlanningService,
    private readonly executionService: ExecutionService,
  ) {}

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

    await this.queueService.addTaskJob('execute-after-plan', task.id, { userId });

    return this.findOne(userId, task.id);
  }

  async findAll(userId: string, filter: TaskFilterDto = {}) {
    return this.prisma.task.findMany({
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
      take: filter.limit || 50,
      skip: filter.offset || 0,
    });
  }

  async findOne(userId: string, id: string) {
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
    return this.prisma.task.update({ where: { id }, data: updateTaskDto });
  }

  async cancel(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.task.update({
      where: { id },
      data: { status: TaskStatus.CANCELLED },
    });
  }
}
