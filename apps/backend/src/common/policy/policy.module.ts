import { Global, Module } from '@nestjs/common';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module';
import { PolicyService } from './policy.service';

@Global()
@Module({
  imports: [CircuitBreakerModule],
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PolicyModule {}
