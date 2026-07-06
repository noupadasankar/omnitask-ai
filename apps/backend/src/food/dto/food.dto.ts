import { z } from 'zod';

export const GenerateRecipeSchema = z.object({
  ingredients: z.array(z.string().min(1)).min(1, 'At least one ingredient required'),
  dietPreference: z.string().max(100).optional(),
});

export type GenerateRecipeDto = z.infer<typeof GenerateRecipeSchema>;

export const CreateOrderSchema = z.object({
  platform: z.string().min(1, 'Platform is required').max(100),
  restaurantName: z.string().min(1, 'Restaurant name is required').max(200),
  items: z.any(),
  totalAmount: z.number().positive('Total amount must be positive'),
});

export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;
