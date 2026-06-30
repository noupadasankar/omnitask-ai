import { Global, Module } from '@nestjs/common';
import { AgentMessageBusService } from './message-bus.service';

@Global()
@Module({
  providers: [AgentMessageBusService],
  exports: [AgentMessageBusService],
})
export class AgentMessageBusModule {}
