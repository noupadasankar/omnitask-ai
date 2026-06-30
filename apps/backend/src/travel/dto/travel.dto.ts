import { z } from 'zod';

export const FlightSearchSchema = z.object({
  origin: z.string().min(1, 'Origin is required').max(100),
  destination: z.string().min(1, 'Destination is required').max(100),
  date: z.string().min(1, 'Date is required').refine(
    (val) => !isNaN(Date.parse(val)),
    'Invalid date format',
  ),
  budget: z.number().positive().optional(),
});

export type FlightSearchDto = z.infer<typeof FlightSearchSchema>;

export const HotelSearchSchema = z.object({
  destination: z.string().min(1, 'Destination is required').max(100),
  checkIn: z.string().min(1, 'Check-in date is required').refine(
    (val) => !isNaN(Date.parse(val)),
    'Invalid date format',
  ),
  checkOut: z.string().min(1, 'Check-out date is required').refine(
    (val) => !isNaN(Date.parse(val)),
    'Invalid date format',
  ),
  budget: z.number().positive().optional(),
});

export type HotelSearchDto = z.infer<typeof HotelSearchSchema>;

export const ItinerarySchema = z.object({
  destination: z.string().min(1, 'Destination is required').max(100),
  days: z.number().int().positive().max(365, 'Max 365 days'),
  interests: z.array(z.string()).optional(),
});

export type ItineraryDto = z.infer<typeof ItinerarySchema>;

export const CreateBookingSchema = z.object({
  type: z.enum(['FLIGHT', 'HOTEL', 'ITINERARY', 'PACKAGE']),
  destination: z.string().min(1, 'Destination is required').max(100),
  details: z.record(z.string(), z.any()),
});

export type CreateBookingDto = z.infer<typeof CreateBookingSchema>;
