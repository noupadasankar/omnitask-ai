import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecipeEngineService } from './recipe-engine.service';
import { NutritionAnalyzerService } from './nutrition-analyzer.service';

@Injectable()
export class FoodService {
  constructor(
    private prisma: PrismaService,
    private recipeEngine: RecipeEngineService,
    private nutritionAnalyzer: NutritionAnalyzerService,
  ) {}

  async findRestaurants(latitude?: number, longitude?: number, dietFilter?: string) {
    await new Promise((resolve) => setTimeout(resolve, 800));

    return [
      { id: 'res_001', name: 'Spice Garden', rating: 4.3, cuisines: ['North Indian', 'Biryani'], deliveryTime: '25m', priceForTwo: 500, platforms: ['swiggy', 'zomato'] },
      { id: 'res_002', name: 'Salad House', rating: 4.6, cuisines: ['Healthy Food', 'Salads'], deliveryTime: '20m', priceForTwo: 450, platforms: ['swiggy'] },
      { id: 'res_003', name: 'Burger Point', rating: 4.0, cuisines: ['Fast Food', 'Beverages'], deliveryTime: '30m', priceForTwo: 300, platforms: ['zomato'] },
      { id: 'res_004', name: 'Green Kitchen', rating: 4.5, cuisines: ['Vegan', 'South Indian'], deliveryTime: '22m', priceForTwo: 400, platforms: ['swiggy', 'zomato'] },
    ];
  }

  async generateRecipe(userId: string, ingredients: string[], dietPreference?: string) {
    const recipe = await this.recipeEngine.generateRecipe(ingredients, dietPreference);
    const nutrition = await this.nutritionAnalyzer.analyze(recipe.title, recipe.ingredients || ingredients);

    return {
      recipe,
      nutrition,
    };
  }

  async listOrders(userId: string) {
    return this.prisma.foodOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOrder(userId: string, platform: string, restaurantName: string, items: any, totalAmount: number) {
    return this.prisma.foodOrder.create({
      data: {
        userId,
        platform,
        restaurantName,
        items,
        totalAmount,
        status: 'ORDERED',
      },
    });
  }
}
