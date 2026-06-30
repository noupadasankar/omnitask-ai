import { Controller, Post, Get, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { AbTestingService } from './ab-testing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('ab-testing')
@UseGuards(JwtAuthGuard)
export class AbTestingController {
  constructor(private readonly abTestingService: AbTestingService) {}

  @Post()
  create(@Request() req: any, @Body() dto: any) {
    return this.abTestingService.createTest(req.user.id, dto);
  }

  @Post(':id/record')
  record(@Param('id') id: string, @Body() dto: any) {
    return this.abTestingService.recordRun(id, dto);
  }

  @Get()
  list(@Request() req: any) {
    return this.abTestingService.listActive(req.user.id);
  }

  @Get(':id')
  results(@Param('id') id: string) {
    return this.abTestingService.getResults(id);
  }
}
