import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FoodService } from './food.service';

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

  @Post('recipe')
  async generateRecipe(
    @Request() req: any,
    @Body() body: { ingredients: string[]; dietPreference?: string },
  ) {
    return this.foodService.generateRecipe(
      req.user.id,
      body.ingredients,
      body.dietPreference,
    );
  }

  @Get('orders')
  async listOrders(@Request() req: any) {
    return this.foodService.listOrders(req.user.id);
  }

  @Post('orders')
  async createOrder(
    @Request() req: any,
    @Body() body: { platform: string; restaurantName: string; items: any; totalAmount: number },
  ) {
    return this.foodService.createOrder(
      req.user.id,
      body.platform,
      body.restaurantName,
      body.items,
      body.totalAmount,
    );
  }
}
