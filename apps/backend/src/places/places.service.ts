import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface PlaceResult {
  externalId: string;
  source: 'google' | 'yelp';
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  rating?: number;
  priceLevel?: number;
  categories: string[];
  photos: string[];
  hours?: Record<string, string>;
}

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async searchRestaurants(lat: number, lng: number, radius = 1000, diet?: string): Promise<PlaceResult[]> {
    try {
      return await this.searchGooglePlaces(lat, lng, 'restaurant', radius, diet);
    } catch (err) {
      this.logger.warn(`Google Places failed, falling back to Yelp: ${(err as Error).message}`);
      return this.searchYelp(lat, lng, 'restaurants', diet);
    }
  }

  async searchPlaces(query: string, lat?: number, lng?: number): Promise<PlaceResult[]> {
    try {
      return await this.searchGooglePlaces(lat, lng, query);
    } catch (err) {
      this.logger.warn(`Google Places failed, falling back to Yelp: ${(err as Error).message}`);
      return this.searchYelp(lat, lng, query);
    }
  }

  async getPlaceDetails(placeId: string, source: 'google' | 'yelp'): Promise<PlaceResult | null> {
    if (source === 'google') return this.getGooglePlaceDetails(placeId);
    return this.getYelpBusinessDetails(placeId);
  }

  async checkAvailability(placeId: string, source: string, time: string): Promise<{ available: boolean; slots?: string[] }> {
    if (source === 'google') return { available: true, slots: ['11:00', '12:00', '13:00', '18:00', '19:00', '20:00'] };
    return { available: true, slots: ['12:00', '13:00', '18:00', '19:00'] };
  }

  async createBooking(userId: string, placeId: string, placeName: string, bookingTime: string, partySize?: number): Promise<{ bookingId: string; status: string }> {
    const booking = await this.prisma.placeBooking.create({
      data: { userId, placeId, placeName, bookingTime: new Date(bookingTime), partySize, status: 'pending' },
    });
    return { bookingId: booking.id, status: 'pending' };
  }

  private async searchGooglePlaces(lat?: number, lng?: number, type?: string, radius = 1000, diet?: string): Promise<PlaceResult[]> {
    const apiKey = this.config.get<string>('GOOGLE_PLACES_API_KEY');
    if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

    const query = diet ? `${type} ${diet}` : type;
    let url: string;
    if (lat && lng) {
      url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type || 'restaurant'}&key=${apiKey}`;
    } else {
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query || 'restaurants')}&key=${apiKey}`;
    }

    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Places API error: ${data.status}`);
    }
    return (data.results || []).slice(0, 20).map((p: any) => ({
      externalId: p.place_id,
      source: 'google' as const,
      name: p.name,
      address: p.vicinity || p.formatted_address || '',
      lat: p.geometry?.location?.lat || lat || 0,
      lng: p.geometry?.location?.lng || lng || 0,
      phone: p.formatted_phone_number,
      rating: p.rating,
      priceLevel: p.price_level,
      categories: p.types || [],
      photos: (p.photos || []).map((ph: any) =>
        `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${ph.photo_reference}&key=${apiKey}`),
      hours: p.opening_hours?.periodic ? this.parseGoogleHours(p.opening_hours.periods) : undefined,
    }));
  }

  private async getGooglePlaceDetails(placeId: string): Promise<PlaceResult | null> {
    const apiKey = this.config.get<string>('GOOGLE_PLACES_API_KEY');
    if (!apiKey) return null;
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,rating,price_level,types,photos,opening_hours,formatted_phone_number,website&key=${apiKey}`);
    const data = await res.json();
    if (data.status !== 'OK') return null;
    const p = data.result;
    return {
      externalId: placeId,
      source: 'google',
      name: p.name,
      address: p.formatted_address || '',
      lat: p.geometry?.location?.lat || 0,
      lng: p.geometry?.location?.lng || 0,
      phone: p.formatted_phone_number,
      website: p.website,
      rating: p.rating,
      priceLevel: p.price_level,
      categories: p.types || [],
      photos: (p.photos || []).map((ph: any) =>
        `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${ph.photo_reference}&key=${apiKey}`),
      hours: p.opening_hours?.periods ? this.parseGoogleHours(p.opening_hours.periods) : undefined,
    };
  }

  private async searchYelp(lat?: number, lng?: number, term?: string, diet?: string): Promise<PlaceResult[]> {
    const apiKey = this.config.get<string>('YELP_API_KEY');
    if (!apiKey) throw new Error('YELP_API_KEY not configured');

    const query = diet ? `${term} ${diet}` : term;
    let url = 'https://api.yelp.com/v3/businesses/search?';
    if (lat && lng) url += `latitude=${lat}&longitude=${lng}`;
    else url += `location=US`;
    if (query) url += `&term=${encodeURIComponent(query || '')}`;
    url += '&limit=20';

    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const data = await res.json();
    if (!data.businesses) throw new Error(`Yelp API error: ${data.error?.description || 'unknown'}`);

    return (data.businesses || []).map((b: any) => ({
      externalId: b.id,
      source: 'yelp' as const,
      name: b.name,
      address: b.location?.address1 ? `${b.location.address1}, ${b.location.city}, ${b.location.state}` : '',
      lat: b.coordinates?.latitude || lat || 0,
      lng: b.coordinates?.longitude || lng || 0,
      phone: b.display_phone,
      website: b.url,
      rating: b.rating,
      priceLevel: b.price?.length || undefined,
      categories: b.categories?.map((c: any) => c.alias) || [],
      photos: b.photos || [],
      hours: undefined,
    }));
  }

  private async getYelpBusinessDetails(businessId: string): Promise<PlaceResult | null> {
    const apiKey = this.config.get<string>('YELP_API_KEY');
    if (!apiKey) return null;
    const res = await fetch(`https://api.yelp.com/v3/businesses/${businessId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const b = await res.json();
    if (!b.id) return null;
    return {
      externalId: b.id,
      source: 'yelp',
      name: b.name,
      address: b.location?.address1 ? `${b.location.address1}, ${b.location.city}, ${b.location.state}` : '',
      lat: b.coordinates?.latitude || 0,
      lng: b.coordinates?.longitude || 0,
      phone: b.display_phone,
      website: b.url,
      rating: b.rating,
      priceLevel: b.price?.length || undefined,
      categories: b.categories?.map((c: any) => c.alias) || [],
      photos: b.photos || [],
      hours: b.hours?.open ? this.parseYelpHours(b.hours.open) : undefined,
    };
  }

  private parseGoogleHours(periods: any[]): Record<string, string> {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const result: Record<string, string> = {};
    for (const p of periods || []) {
      const day = days[p.open?.day];
      if (day) result[day] = `${p.open?.time || ''}-${p.close?.time || ''}`;
    }
    return result;
  }

  private parseYelpHours(periods: any[]): Record<string, string> {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const result: Record<string, string> = {};
    for (const p of periods || []) {
      const day = days[p.day];
      if (day) result[day] = `${p.start}-${p.end}`;
    }
    return result;
  }
}
