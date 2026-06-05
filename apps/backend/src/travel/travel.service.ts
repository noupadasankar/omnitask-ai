import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FlightSearchService } from './flight-search.service';
import { HotelSearchService } from './hotel-search.service';
import { ItineraryBuilderService } from './itinerary-builder.service';
import { TravelBookingType } from '@prisma/client';

@Injectable()
export class TravelService {
  constructor(
    private prisma: PrismaService,
    private flightSearch: FlightSearchService,
    private hotelSearch: HotelSearchService,
    private itineraryBuilder: ItineraryBuilderService,
  ) {}

  async searchFlights(userId: string, origin: string, destination: string, date: string, budget?: number) {
    const results = await this.flightSearch.search(origin, destination, date, budget);
    
    await this.prisma.travelBooking.create({
      data: {
        userId,
        type: 'FLIGHT',
        origin,
        destination,
        departDate: new Date(date),
        budget,
        status: 'FOUND',
        results: results as any,
      },
    });

    return results;
  }

  async searchHotels(userId: string, destination: string, checkIn: string, checkOut: string, budget?: number) {
    const results = await this.hotelSearch.search(destination, checkIn, checkOut, budget);

    await this.prisma.travelBooking.create({
      data: {
        userId,
        type: 'HOTEL',
        destination,
        departDate: new Date(checkIn),
        returnDate: new Date(checkOut),
        budget,
        status: 'FOUND',
        results: results as any,
      },
    });

    return results;
  }

  async generateItinerary(userId: string, destination: string, days: number, interests: string[]) {
    const itinerary = await this.itineraryBuilder.build(destination, days, interests);

    await this.prisma.travelBooking.create({
      data: {
        userId,
        type: 'ITINERARY',
        destination,
        status: 'FOUND',
        results: itinerary as any,
      },
    });

    return itinerary;
  }

  async listBookings(userId: string) {
    return this.prisma.travelBooking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBooking(userId: string, type: TravelBookingType, destination: string, details: any) {
    return this.prisma.travelBooking.create({
      data: {
        userId,
        type,
        destination,
        status: 'BOOKED',
        selectedOption: details,
      },
    });
  }
}
