import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TravelService } from './travel.service';
import { FlightSearchSchema, HotelSearchSchema, ItinerarySchema, CreateBookingSchema } from './dto/travel.dto';
import type { FlightSearchDto, HotelSearchDto, ItineraryDto, CreateBookingDto } from './dto/travel.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TravelBookingType } from '@prisma/client';
import { CursorPaginationSchema } from '../common/dto/pagination.dto';
import type { CursorPaginationDto } from '../common/dto/pagination.dto';

@Controller('travel')
@UseGuards(JwtAuthGuard)
export class TravelController {
  constructor(private travelService: TravelService) {}

  @Post('search/flights')
  async searchFlights(
    @Request() req: any,
    @Body(new ZodValidationPipe(FlightSearchSchema)) body: FlightSearchDto,
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
    @Body(new ZodValidationPipe(HotelSearchSchema)) body: HotelSearchDto,
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
    @Body(new ZodValidationPipe(ItinerarySchema)) body: ItineraryDto,
  ) {
    return this.travelService.generateItinerary(
      req.user.id,
      body.destination,
      body.days,
      body.interests || [],
    );
  }

  @Get('bookings')
  async listBookings(
    @Request() req: any,
    @Query(new ZodValidationPipe(CursorPaginationSchema)) query: CursorPaginationDto,
  ) {
    return this.travelService.listBookings(req.user.id, query.cursor, query.take);
  }

  @Post('bookings')
  async createBooking(
    @Request() req: any,
    @Body(new ZodValidationPipe(CreateBookingSchema)) body: CreateBookingDto,
  ) {
    return this.travelService.createBooking(
      req.user.id,
      body.type as TravelBookingType,
      body.destination,
      body.details,
    );
  }
}
