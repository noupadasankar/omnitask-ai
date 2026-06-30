import { Module } from '@nestjs/common';
import { ZomatoAdapter } from './zomato-adapter.service';
import { SwiggyAdapter } from './swiggy-adapter.service';

@Module({
  providers: [ZomatoAdapter, SwiggyAdapter],
  exports: [ZomatoAdapter, SwiggyAdapter],
})
export class DomainAdaptersModule {}
