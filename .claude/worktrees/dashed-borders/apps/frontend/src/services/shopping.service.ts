import { api } from './api';

export interface ShoppingPreference {
  id?: string;
  userId?: string;
  categories: string[];
  mustHaveFeatures: string[];
  avoidKeywords: string[];
  preferredBrands: string[];
  maxPrice?: number | null;
  minRating: number;
  minScore: number;
  autoBuyLimit: number;
}

export interface TrackedProduct {
  id: string;
  site: string;
  externalProductId: string;
  title: string;
  brand: string | null;
  url: string | null;
  currency: string;
  lastPrice: number | null;
  targetPrice: number | null;
  rating: number | null;
  score: number;
  matchReasons: any;
  status: 'MATCHED' | 'SKIPPED' | 'WATCHING' | 'PENDING_APPROVAL' | 'PURCHASED' | 'FAILED';
  createdAt: string;
}

export async function getShoppingPreferences(): Promise<ShoppingPreference> {
  const { data } = await api.get<ShoppingPreference>('/shopping/preferences');
  return data;
}

export async function saveShoppingPreferences(prefs: ShoppingPreference): Promise<ShoppingPreference> {
  const { data } = await api.put<ShoppingPreference>('/shopping/preferences', prefs);
  return data;
}

export async function getTrackedProducts(status?: string): Promise<TrackedProduct[]> {
  const { data } = await api.get<TrackedProduct[]>('/shopping/products', {
    params: status ? { status } : undefined,
  });
  return data;
}

export async function getShoppingStats(): Promise<any> {
  const { data } = await api.get<any>('/shopping/stats');
  return data;
}

export async function watchProduct(product: any, targetPrice?: number): Promise<any> {
  const { data } = await api.post('/shopping/watch', { product, targetPrice });
  return data;
}
