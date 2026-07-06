import { api } from './api';

export interface FoodOrder {
  id: string;
  platform: string;
  restaurantName: string | null;
  items: any;
  totalAmount: number | null;
  status: string;
  createdAt: string;
}

export async function getRestaurants(lat?: number, lng?: number, diet?: string): Promise<any[]> {
  const { data } = await api.get<any[]>('/food/restaurants', {
    params: { lat, lng, diet },
  });
  return data;
}

export async function generateRecipe(ingredients: string[], dietPreference?: string): Promise<any> {
  const { data } = await api.post<any>('/food/recipe', { ingredients, dietPreference });
  return data;
}

export async function getFoodOrders(): Promise<FoodOrder[]> {
  const { data } = await api.get<FoodOrder[]>('/food/orders');
  return data;
}

export async function createFoodOrder(platform: string, restaurantName: string, items: any, totalAmount: number): Promise<FoodOrder> {
  const { data } = await api.post<FoodOrder>('/food/orders', { platform, restaurantName, items, totalAmount });
  return data;
}
