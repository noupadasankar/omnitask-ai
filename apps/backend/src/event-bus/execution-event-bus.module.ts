import { Global, Module } from '@nestjs/common';
import { ExecutionEventBus } from './execution-event-bus.service';

@Global()
@Module({
  providers: [ExecutionEventBus],
  exports: [ExecutionEventBus],
})
export class ExecutionEventBusModule {}
