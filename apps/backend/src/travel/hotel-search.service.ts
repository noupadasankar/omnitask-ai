import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class HotelSearchService {
  private readonly logger = new Logger(HotelSearchService.name);

  async search(destination: string, checkIn: string, checkOut: string, budget?: number) {
    this.logger.log(`Searching hotels in ${destination} checking in on ${checkIn} (budget: ${budget || 'none'})`);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const allHotels = [
      { id: 'ht_001', name: 'Grand Palace Hotel', pricePerNight: 3500, rating: 4.5, address: 'Mall Road' },
      { id: 'ht_002', name: 'Budget Inn', pricePerNight: 1800, rating: 3.8, address: 'Near Railway Station' },
      { id: 'ht_003', name: 'Royal Residency', pricePerNight: 5200, rating: 4.8, address: 'Lake View Road' },
      { id: 'ht_004', name: 'Greenwood Resort', pricePerNight: 4100, rating: 4.2, address: 'Forest Range' },
    ];

    return budget ? allHotels.filter((h) => h.pricePerNight <= budget) : allHotels;
  }
}
