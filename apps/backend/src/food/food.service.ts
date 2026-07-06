import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecipeEngineService } from './recipe-engine.service';
import { NutritionAnalyzerService } from './nutrition-analyzer.service';
import { PlacesService } from '../places/places.service';

@Injectable()
export class FoodService {
  constructor(
    private prisma: PrismaService,
    private recipeEngine: RecipeEngineService,
    private nutritionAnalyzer: NutritionAnalyzerService,
    private placesService: PlacesService,
  ) {}

  async findRestaurants(latitude?: number, longitude?: number, dietFilter?: string) {
    const places = await this.placesService.searchRestaurants(
      latitude || 40.7128,
      longitude || -74.006,
      1000,
      dietFilter,
    );
    return places.map((p) => ({
      id: p.externalId,
      name: p.name,
      rating: p.rating,
      cuisines: p.categories,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      photos: p.photos,
      priceLevel: p.priceLevel,
      hours: p.hours,
    }));
  }

  async generateRecipe(userId: string, ingredients: string[], dietPreference?: string) {
    const recipe = await this.recipeEngine.generateRecipe(ingredients, dietPreference);
    const nutrition = await this.nutritionAnalyzer.analyze(recipe.title, recipe.ingredients || ingredients);
    return { recipe, nutrition };
  }

  async checkAvailability(placeId: string, source: string, time: string) {
    return this.placesService.checkAvailability(placeId, source, time);
  }

  async bookTable(userId: string, placeId: string, placeName: string, bookingTime: string, partySize?: number) {
    return this.placesService.createBooking(userId, placeId, placeName, bookingTime, partySize);
  }

  async listOrders(userId: string, cursor?: string, take: number = 20) {
    const pageSize = Math.min(take, 100);
    const decodedCursor = cursor
      ? (() => { try { return Buffer.from(cursor, 'base64url').toString('utf-8'); } catch { return undefined; } })()
      : undefined;
    const items = await this.prisma.foodOrder.findMany({
      take: pageSize + 1,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const hasMore = items.length > pageSize;
    const data = hasMore ? items.slice(0, pageSize) : items;
    const last = data[data.length - 1];
    return {
      data,
      nextCursor: last && hasMore ? Buffer.from(last.id, 'utf-8').toString('base64url') : null,
      hasMore,
    };
  }

  async createOrder(userId: string, platform: string, restaurantName: string, items: any, totalAmount: number) {
    return this.prisma.foodOrder.create({
      data: { userId, platform, restaurantName, items, totalAmount, status: 'ORDERED' },
    });
  }
}
