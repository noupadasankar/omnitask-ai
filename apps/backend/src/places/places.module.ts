import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlacesService } from './places.service';

@Module({
  imports: [PrismaModule],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
