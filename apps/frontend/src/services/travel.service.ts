import { api } from './api';

export interface TravelBooking {
  id: string;
  type: 'FLIGHT' | 'HOTEL' | 'ITINERARY' | 'PACKAGE';
  origin: string | null;
  destination: string;
  departDate?: string | null;
  returnDate?: string | null;
  travelers: number;
  budget?: number | null;
  status: string;
  results: any;
  selectedOption: any;
  createdAt: string;
}

export async function searchFlights(origin: string, destination: string, date: string, budget?: number): Promise<any[]> {
  const { data } = await api.post<any[]>('/travel/search/flights', { origin, destination, date, budget });
  return data;
}

export async function searchHotels(destination: string, checkIn: string, checkOut: string, budget?: number): Promise<any[]> {
  const { data } = await api.post<any[]>('/travel/search/hotels', { destination, checkIn, checkOut, budget });
  return data;
}

export async function generateItinerary(destination: string, days: number, interests?: string[]): Promise<any> {
  const { data } = await api.post<any>('/travel/itinerary', { destination, days, interests });
  return data;
}

export async function getTravelBookings(): Promise<TravelBooking[]> {
  const { data } = await api.get<TravelBooking[]>('/travel/bookings');
  return data;
}

export async function createTravelBooking(type: string, destination: string, details: any): Promise<TravelBooking> {
  const { data } = await api.post<TravelBooking>('/travel/bookings', { type, destination, details });
  return data;
}
