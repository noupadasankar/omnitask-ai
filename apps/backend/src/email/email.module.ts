import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { VaultModule } from '../vault/vault.module';

@Module({
  imports: [PrismaModule, VaultModule],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
