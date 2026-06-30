import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { CalendarService } from './calendar.service';
import {
  ConnectCalendarSchema, CreateEventSchema, UpdateEventSchema, FindTimeSchema,
} from './dto/calendar.dto';
import type { ConnectCalendarDto, CreateEventDto, UpdateEventDto, FindTimeDto } from './dto/calendar.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post('connect')
  @HttpCode(HttpStatus.CREATED)
  connect(@Request() req: any, @Body(new ZodValidationPipe(ConnectCalendarSchema)) dto: ConnectCalendarDto) {
    return this.calendarService.connect(req.user.id, dto.provider, dto.code, dto.redirectUri);
  }

  @Post('disconnect/:accountId')
  @HttpCode(HttpStatus.OK)
  disconnect(@Request() req: any, @Param('accountId') accountId: string) {
    return this.calendarService.disconnect(req.user.id, accountId);
  }

  @Get('accounts')
  listAccounts(@Request() req: any) {
    return this.calendarService.listAccounts(req.user.id);
  }

  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  createEvent(@Request() req: any, @Body(new ZodValidationPipe(CreateEventSchema)) dto: CreateEventDto) {
    return this.calendarService.createEvent(req.user.id, dto);
  }

  @Get('events')
  listEvents(
    @Request() req: any,
    @Query('accountId') accountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.calendarService.listEvents(req.user.id, accountId, from, to);
  }

  @Put('events/:id')
  @HttpCode(HttpStatus.OK)
  updateEvent(
    @Request() req: any, @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateEventSchema)) dto: UpdateEventDto,
  ) {
    return this.calendarService.updateEvent(req.user.id, id, dto);
  }

  @Delete('events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEvent(@Request() req: any, @Param('id') id: string) {
    await this.calendarService.deleteEvent(req.user.id, id);
  }

  @Post('find-time')
  @HttpCode(HttpStatus.OK)
  findTime(@Request() req: any, @Body(new ZodValidationPipe(FindTimeSchema)) dto: FindTimeDto) {
    return this.calendarService.findAvailableSlots(req.user.id, dto);
  }
}
