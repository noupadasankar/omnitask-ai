import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FoodController } from './food.controller';
import { FoodService } from './food.service';
import { RecipeEngineService } from './recipe-engine.service';
import { NutritionAnalyzerService } from './nutrition-analyzer.service';

@Module({
  imports: [PrismaModule],
  controllers: [FoodController],
  providers: [
    FoodService,
    RecipeEngineService,
    NutritionAnalyzerService,
  ],
  exports: [FoodService],
})
export class FoodModule {}
