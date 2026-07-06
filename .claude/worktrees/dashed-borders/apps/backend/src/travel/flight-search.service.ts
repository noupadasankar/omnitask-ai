import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class FlightSearchService {
  private readonly logger = new Logger(FlightSearchService.name);

  async search(origin: string, destination: string, date: string, budget?: number) {
    this.logger.log(`Searching flights from ${origin} to ${destination} on ${date} (budget: ${budget || 'none'})`);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const allFlights = [
      { id: 'fl_001', airline: 'IndiGo', price: 5400, departure: '06:00', arrival: '08:30', stops: 0 },
      { id: 'fl_002', airline: 'Air India', price: 6200, departure: '09:15', arrival: '11:45', stops: 0 },
      { id: 'fl_003', airline: 'Akasa Air', price: 4800, departure: '13:00', arrival: '15:30', stops: 0 },
      { id: 'fl_004', airline: 'Vistara', price: 7500, departure: '18:30', arrival: '21:00', stops: 0 },
    ];

    return budget ? allFlights.filter((f) => f.price <= budget) : allFlights;
  }
}
