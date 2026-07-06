import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TravelController } from './travel.controller';
import { TravelService } from './travel.service';
import { FlightSearchService } from './flight-search.service';
import { HotelSearchService } from './hotel-search.service';
import { ItineraryBuilderService } from './itinerary-builder.service';

@Module({
  imports: [PrismaModule],
  controllers: [TravelController],
  providers: [
    TravelService,
    FlightSearchService,
    HotelSearchService,
    ItineraryBuilderService,
  ],
  exports: [TravelService],
})
export class TravelModule {}
