import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FoodService } from './food.service';

// The Places-dependent food routes stay in NestJS (PlacesService is Node infra
// with API keys). The recipe + orders routes were ported to browser-py and are
// reverse-proxied there from main.ts (pathFilter on /api/food/recipe|/orders).
@Controller('food')
@UseGuards(JwtAuthGuard)
export class FoodController {
  constructor(private foodService: FoodService) {}

  @Get('restaurants')
  async getRestaurants(
    @Query('lat') lat?: number,
    @Query('lng') lng?: number,
    @Query('diet') diet?: string,
  ) {
    return this.foodService.findRestaurants(
      lat ? Number(lat) : undefined,
      lng ? Number(lng) : undefined,
      diet,
    );
  }

  @Get('availability/:placeId')
  async checkAvailability(
    @Param('placeId') placeId: string,
    @Query('source') source: string,
    @Query('time') time: string,
  ) {
    return this.foodService.checkAvailability(placeId, source, time);
  }

  @Post('book')
  @HttpCode(HttpStatus.CREATED)
  async bookTable(
    @Request() req: any,
    @Body() body: { placeId: string; placeName: string; bookingTime: string; partySize?: number },
  ) {
    return this.foodService.bookTable(req.user.id, body.placeId, body.placeName, body.bookingTime, body.partySize);
  }
}
