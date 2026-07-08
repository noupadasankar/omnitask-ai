import { Injectable } from '@nestjs/common';
import { PlacesService } from '../places/places.service';

// Slimmed to the Places-dependent operations only. Recipe generation and
// FoodOrder CRUD were ported to browser-py (apps/browser-py/domains/food.py).
@Injectable()
export class FoodService {
  constructor(private placesService: PlacesService) {}

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

  async checkAvailability(placeId: string, source: string, time: string) {
    return this.placesService.checkAvailability(placeId, source, time);
  }

  async bookTable(userId: string, placeId: string, placeName: string, bookingTime: string, partySize?: number) {
    return this.placesService.createBooking(userId, placeId, placeName, bookingTime, partySize);
  }
}
