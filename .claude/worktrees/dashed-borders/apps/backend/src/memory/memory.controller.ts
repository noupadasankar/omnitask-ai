import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MemoryType } from '@prisma/client';

@Controller('memory')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Get()
  getRecent(@Request() req: { user: { id: string } }, @Query('limit') limit?: string) {
    return this.memoryService.getRecent(req.user.id, limit ? Number(limit) : 20);
  }

  @Get('search')
  search(
    @Request() req: { user: { id: string } },
    @Query('q') q: string,
    @Query('type') type?: MemoryType,
  ) {
    return this.memoryService.retrieveRelevant(req.user.id, q || '', { type });
  }
}
