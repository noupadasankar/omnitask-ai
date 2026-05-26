import { Module } from '@nestjs/common';
import { PlanningService } from './planning.service';
import { AiPlannerService } from './ai-planner.service';
import { PlanningController } from './planning.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PlanningService, AiPlannerService],
  controllers: [PlanningController],
  exports: [PlanningService, AiPlannerService],
})
export class PlanningModule {}
