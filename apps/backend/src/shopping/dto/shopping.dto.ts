import { z } from 'zod';

export const ShoppingPreferenceSchema = z.object({
  preferredSites: z.array(z.string()).optional(),
  avoidedSites: z.array(z.string()).optional(),
  preferredBrands: z.array(z.string()).optional(),
  avoidKeywords: z.array(z.string()).optional(),
  maxPrice: z.number().positive().optional(),
  minRating: z.number().min(0).max(5).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  autoBuyLimit: z.number().int().nonnegative().optional(),
});

export type ShoppingPreferenceDto = z.infer<typeof ShoppingPreferenceSchema>;

const ProductListingSchema = z.object({
  site: z.string().min(1),
  externalProductId: z.string().min(1),
  title: z.string().min(1),
  brand: z.string().optional(),
  url: z.string().url().optional(),
  price: z.number().nullable().optional(),
  currency: z.string().optional(),
  rating: z.number().nullable().optional(),
  reviewCount: z.number().int().nonnegative().nullable().optional(),
  features: z.array(z.string()).optional(),
  description: z.string().optional(),
}).passthrough();

export const EvaluateProductsSchema = z.object({
  products: z.array(ProductListingSchema).min(1, 'At least one product required'),
});

export type EvaluateProductsDto = z.infer<typeof EvaluateProductsSchema>;

export const WatchProductSchema = z.object({
  product: ProductListingSchema,
  targetPrice: z.number().positive().optional(),
});

export type WatchProductDto = z.infer<typeof WatchProductSchema>;

export const ObservePriceSchema = z.object({
  trackedId: z.string().min(1, 'Tracked ID is required'),
  price: z.number().positive('Price must be positive'),
  dropPct: z.number().min(0).max(100).optional(),
});

export type ObservePriceDto = z.infer<typeof ObservePriceSchema>;
