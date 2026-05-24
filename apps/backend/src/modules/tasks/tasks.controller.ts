import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { TaskStatus } from './enums/task-status.enum';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateTaskDto) { return this.tasks.create(req.user.id, dto); }

  @Get()
  @ApiQuery({ name: 'page', required: false }) @ApiQuery({ name: 'limit', required: false }) @ApiQuery({ name: 'status', required: false, enum: TaskStatus })
  findAll(@Req() req: any, @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number, @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number, @Query('status') status?: TaskStatus) {
    return this.tasks.findAll(req.user.id, page, limit, status);
  }

  @Get('stats')
  stats(@Req() req: any) { return this.tasks.getStats(req.user.id); }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) { return this.tasks.findOne(req.user.id, id); }

  @Delete(':id/cancel')
  cancel(@Req() req: any, @Param('id') id: string) { return this.tasks.cancel(req.user.id, id); }
}