import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { PinoLoggerService } from './pino-logger.service';

@Module({
  providers: [PinoLoggerService],
  exports: [PinoLoggerService],
})
export class LoggerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
