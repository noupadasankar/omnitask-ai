import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PreferenceMemoryService } from './preferences/preference-memory.service';

@Module({
  imports: [PrismaModule],
  providers: [MemoryService, PreferenceMemoryService],
  controllers: [MemoryController],
  exports: [MemoryService, PreferenceMemoryService],
})
export class MemoryModule {}
