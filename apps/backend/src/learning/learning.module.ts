import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LearningEngineService } from './learning-engine.service';
import { MemoryStoreService } from '../agent/memory-store.service';

@Module({
  imports: [PrismaModule],
  providers: [LearningEngineService, MemoryStoreService],
  exports: [LearningEngineService],
})
export class LearningModule {}
