import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LearningEngineService } from './learning-engine.service';

@Module({
  imports: [PrismaModule],
  providers: [LearningEngineService],
  exports: [LearningEngineService],
})
export class LearningModule {}
