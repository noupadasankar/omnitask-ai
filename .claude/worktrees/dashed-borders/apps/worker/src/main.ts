import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  logger.log('Standalone worker connected to Redis Bull queue');
  logger.log('Agent execution runs in API process; this worker handles browser-heavy jobs');
  await app.init();
}

bootstrap();
