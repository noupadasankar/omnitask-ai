import { Module } from '@nestjs/common';
import { FoodController } from './food.controller';
import { FoodService } from './food.service';
import { PlacesModule } from '../places/places.module';

// Recipe + orders moved to browser-py; only the Places-backed routes remain, so
// this module needs just PlacesModule (PrismaModule dropped — no direct DB access).
@Module({
  imports: [PlacesModule],
  controllers: [FoodController],
  providers: [FoodService],
  exports: [FoodService],
})
export class FoodModule {}
