import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
  CreateTaskDtoSchema,
} from './dto/task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  findAll(@Request() req: { user: { id: string } }) {
    return this.tasksService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.tasksService.findOne(req.user.id, id);
  }

  @Post()
  create(
    @Request() req: { user: { id: string } },
    @Body(new ZodValidationPipe(CreateTaskDtoSchema)) createTaskDto: CreateTaskDto,
  ) {
    return this.tasksService.create(req.user.id, createTaskDto);
  }

  @Post(':id/execute')
  execute(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.tasksService.execute(req.user.id, id);
  }

  @Put(':id')
  update(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(req.user.id, id, updateTaskDto);
  }
}