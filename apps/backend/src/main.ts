import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 4000;
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Omnitask API')
    .setDescription('Omnitask backend API')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);
  const allowedOrigins = [frontendUrl, 'http://localhost:3000'];
  app.enableCors({
    // Allow the configured frontend plus any localhost/127.0.0.1 origin (any port)
    // so dev works regardless of how the browser resolves "localhost" or which
    // port Next.js lands on (3000/3001/etc). Non-browser requests have no Origin.
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  await app.listen(port);

  logger.log(`Backend running: http://localhost:${port}/api`);
}

bootstrap();
