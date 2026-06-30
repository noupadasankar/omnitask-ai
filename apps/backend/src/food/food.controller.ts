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
import { GenerateRecipeSchema, CreateOrderSchema } from './dto/food.dto';
import type { GenerateRecipeDto, CreateOrderDto } from './dto/food.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CursorPaginationSchema } from '../common/dto/pagination.dto';
import type { CursorPaginationDto } from '../common/dto/pagination.dto';

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
    @Body(new ZodValidationPipe(GenerateRecipeSchema)) body: GenerateRecipeDto,
  ) {
    return this.foodService.generateRecipe(
      req.user.id,
      body.ingredients,
      body.dietPreference,
    );
  }

  @Get('orders')
  async listOrders(
    @Request() req: any,
    @Query(new ZodValidationPipe(CursorPaginationSchema)) query: CursorPaginationDto,
  ) {
    return this.foodService.listOrders(req.user.id, query.cursor, query.take);
  }

  @Post('orders')
  async createOrder(
    @Request() req: any,
    @Body(new ZodValidationPipe(CreateOrderSchema)) body: CreateOrderDto,
  ) {
    return this.foodService.createOrder(
      req.user.id,
      body.platform,
      body.restaurantName,
      body.items,
      body.totalAmount,
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
