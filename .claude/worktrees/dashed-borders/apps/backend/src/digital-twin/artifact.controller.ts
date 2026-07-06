import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ArtifactStoreService, ArtifactQuery } from './artifact-store.service';
import { ArtifactKind } from '@prisma/client';

@Controller('artifacts')
@UseGuards(JwtAuthGuard)
export class ArtifactController {
  constructor(private readonly store: ArtifactStoreService) {}

  @Get()
  async list(
    @Request() req: any,
    @Query('kind') kind?: ArtifactKind,
    @Query('tag') tag?: string,
    @Query('q') q?: string,
    @Query('sessionId') sessionId?: string,
  ) {
    const query: ArtifactQuery = { kind, tag, q, sessionId };
    return this.store.search(req.user.id, query);
  }

  @Get('stats')
  async stats(@Request() req: any) {
    return this.store.stats(req.user.id);
  }

  @Get(':id')
  async get(@Request() req: any, @Param('id') id: string) {
    return this.store.get(req.user.id, id);
  }

  @Get('versions/:title')
  async versions(@Request() req: any, @Param('title') title: string) {
    return this.store.versions(req.user.id, title);
  }
}
