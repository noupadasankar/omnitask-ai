import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TravelService } from './travel.service';
import { TravelBookingType } from '@prisma/client';

@Controller('travel')
@UseGuards(JwtAuthGuard)
export class TravelController {
  constructor(private travelService: TravelService) {}

  @Post('search/flights')
  async searchFlights(
    @Request() req: any,
    @Body() body: { origin: string; destination: string; date: string; budget?: number },
  ) {
    return this.travelService.searchFlights(
      req.user.id,
      body.origin,
      body.destination,
      body.date,
      body.budget,
    );
  }

  @Post('search/hotels')
  async searchHotels(
    @Request() req: any,
    @Body() body: { destination: string; checkIn: string; checkOut: string; budget?: number },
  ) {
    return this.travelService.searchHotels(
      req.user.id,
      body.destination,
      body.checkIn,
      body.checkOut,
      body.budget,
    );
  }

  @Post('itinerary')
  async generateItinerary(
    @Request() req: any,
    @Body() body: { destination: string; days: number; interests?: string[] },
  ) {
    return this.travelService.generateItinerary(
      req.user.id,
      body.destination,
      body.days,
      body.interests || [],
    );
  }

  @Get('bookings')
  async listBookings(@Request() req: any) {
    return this.travelService.listBookings(req.user.id);
  }

  @Post('bookings')
  async createBooking(
    @Request() req: any,
    @Body() body: { type: TravelBookingType; destination: string; details: any },
  ) {
    return this.travelService.createBooking(
      req.user.id,
      body.type,
      body.destination,
      body.details,
    );
  }
}
