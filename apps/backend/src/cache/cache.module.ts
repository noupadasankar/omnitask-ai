import { Module, Global } from '@nestjs/common';
import { CacheModule as CacheManagerModule } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';

@Global()

@Module({
  imports: [
    CacheManagerModule.register({
      ttl: 5 * 60 * 1000, // 5 minutes
      max: 100, // maximum number of items in cache
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
