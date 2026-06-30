import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PreferenceMemoryService } from './preferences/preference-memory.service';
import { SessionContextService } from './session-context.service';
import { EpisodicMemoryService } from './episodic-memory.service';
import { SemanticMemoryService } from './semantic-memory.service';
import { ProceduralMemoryService } from './procedural-memory.service';
import { MemoryConsolidationService } from './memory-consolidation.service';
import { MemoryStoreService } from '../agent/memory-store.service';

@Module({
  imports: [PrismaModule],
  providers: [
    MemoryService,
    MemoryStoreService,
    PreferenceMemoryService,
    SessionContextService,
    EpisodicMemoryService,
    SemanticMemoryService,
    ProceduralMemoryService,
    MemoryConsolidationService,
  ],
  controllers: [MemoryController],
  exports: [
    MemoryService,
    PreferenceMemoryService,
    SessionContextService,
    EpisodicMemoryService,
    SemanticMemoryService,
    ProceduralMemoryService,
    MemoryConsolidationService,
  ],
})
export class MemoryModule {}
