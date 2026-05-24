import { Module } from '@nestjs/common';
import { PlanningService } from './planning.service';
import { PlanValidator } from './plan-validator';
import { PlanHasher } from './plan-hasher';

@Module({
  providers: [PlanningService, PlanValidator, PlanHasher],
  exports: [PlanningService],
})
export class PlanningModule {}