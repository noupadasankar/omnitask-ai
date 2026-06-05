import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ArtifactStoreService } from './artifact-store.service';
import { ArtifactController } from './artifact.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ArtifactController],
  providers: [ArtifactStoreService],
  exports: [ArtifactStoreService],
})
export class DigitalTwinModule {}
