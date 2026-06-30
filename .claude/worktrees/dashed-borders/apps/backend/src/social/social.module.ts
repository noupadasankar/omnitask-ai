import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialPostService } from './social-post.service';
import { SocialTrackerService } from './social-tracker.service';
import { LinkedInAdapter } from './platform-adapters/linkedin-adapter';
import { TwitterAdapter } from './platform-adapters/twitter-adapter';

@Module({
  imports: [PrismaModule],
  controllers: [SocialController],
  providers: [
    SocialService,
    SocialPostService,
    SocialTrackerService,
    LinkedInAdapter,
    TwitterAdapter,
  ],
  exports: [SocialService],
})
export class SocialModule {}
