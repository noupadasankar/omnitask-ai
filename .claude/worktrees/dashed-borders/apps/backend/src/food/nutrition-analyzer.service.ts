import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NutritionAnalyzerService {
  private readonly logger = new Logger(NutritionAnalyzerService.name);

  async analyze(recipeTitle: string, ingredients: string[]) {
    this.logger.log(`Analyzing nutrition for recipe="${recipeTitle}"`);
    await new Promise((resolve) => setTimeout(resolve, 800));

    const itemCalories = ingredients.length * 120;
    const protein = ingredients.length * 4.5;
    const carbs = ingredients.length * 15;
    const fat = ingredients.length * 3.2;

    return {
      recipe: recipeTitle,
      calories: itemCalories,
      macronutrients: {
        protein: `${protein.toFixed(1)}g`,
        carbohydrates: `${carbs.toFixed(1)}g`,
        fat: `${fat.toFixed(1)}g`,
      },
      source: 'USDA FoodData Central API Stub',
    };
  }
}
