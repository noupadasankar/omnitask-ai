import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

@Controller('executions')
@UseGuards(JwtAuthGuard)
export class ExecutionController {
  constructor(
    private readonly executionService: ExecutionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':id')
  async getOne(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    const execution = await this.executionService.getExecution(id);
    if (!execution) {
      throw new NotFoundException('Execution not found');
    }

    const task = await this.prisma.task.findFirst({
      where: { id: execution.taskId, userId: req.user.id },
    });
    if (!task) {
      throw new NotFoundException('Execution not found');
    }

    return execution;
  }

  @Get(':id/steps')
  async getSteps(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    const execution = await this.executionService.getExecution(id);
    if (!execution) {
      throw new NotFoundException('Execution not found');
    }

    const task = await this.prisma.task.findFirst({
      where: { id: execution.taskId, userId: req.user.id },
    });
    if (!task) {
      throw new NotFoundException('Execution not found');
    }

    return this.executionService.getExecutionSteps(id);
  }
}
