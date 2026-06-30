import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class RecipeEngineService {
  private readonly logger = new Logger(RecipeEngineService.name);
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY') || 'dummy-key',
    });
  }

  async generateRecipe(ingredients: string[], dietPreference?: string): Promise<any> {
    try {
      this.logger.log(`Generating recipe for ingredients=${ingredients.join(',')} (diet: ${dietPreference || 'none'})`);
      const prompt = `Create a recipe using these ingredients: ${ingredients.join(', ')}.
Dietary Preference: ${dietPreference || 'none'}
Format: JSON object with "title" (string), "prepTime" (string), "cookTime" (string), "ingredients" (string array), and "instructions" (string array).`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });

      return JSON.parse(response.choices[0]?.message?.content || '{}');
    } catch (error) {
      this.logger.error('Error generating recipe', error);
      return {
        title: `Healthy Ingredient Bowl`,
        prepTime: '10 mins',
        cookTime: '15 mins',
        ingredients: ingredients,
        instructions: [
          'Wash and chop all ingredients thoroughly.',
          'Heat a pan with a small amount of oil.',
          'Add the ingredients and sauté for 10-12 minutes.',
          'Season with salt, pepper, and herbs to taste.',
          'Serve warm!',
        ],
      };
    }
  }
}
