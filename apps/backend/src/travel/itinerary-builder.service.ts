import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../common/llm/llm.service';
import { LLM_MODEL_MINI } from '../common/llm-config';

@Injectable()
export class ItineraryBuilderService {
  private readonly logger = new Logger(ItineraryBuilderService.name);

  constructor(private readonly llm: LlmService) {}

  async build(destination: string, days: number, interests: string[] = []): Promise<any> {
    try {
      this.logger.log(`Building itinerary for ${destination} for ${days} days with interests=${interests.join(',')}`);
      const prompt = `Create a day-by-day travel itinerary for ${destination} for ${days} days.
Interests: ${interests.join(', ')}
Format: JSON array of objects, each object having a "day" (number), "theme" (string), and "activities" (string array).`;

      const response = await this.llm.getClient().chat.completions.create({
        model: LLM_MODEL_MINI,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
      return parsed.itinerary || parsed.days || parsed;
    } catch (error) {
      this.logger.error('Error generating itinerary', error);
      const fallback = [];
      for (let i = 1; i <= days; i++) {
        fallback.push({
          day: i,
          theme: `Explore ${destination} - Day ${i}`,
          activities: [
            'Breakfast at local café',
            `Visit top landmarks and scenic locations in ${destination}`,
            'Lunch at a traditional eatery',
            'Afternoon walking tour/local market visit',
            'Dinner at a recommended local restaurant',
          ],
        });
      }
      return fallback;
    }
  }
}
