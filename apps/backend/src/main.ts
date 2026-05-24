import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { TimeoutInterceptor } from './shared/interceptors/timeout.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 4000);
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:3000');

  // Security
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  await app.register(fastifyCors, {
    origin: [frontendUrl, /localhost:\d+/],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters & interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TimeoutInterceptor(30_000),
  );

  // Swagger
  if (configService.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('OmniTask AI API')
      .setDescription('Autonomous agent workforce API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log(`Swagger: http://localhost:${port}/api/docs`);
  }

  app.setGlobalPrefix('api/v1');

  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 Backend running on http://localhost:${port}`);
  logger.log(`🔌 WebSocket ready on ws://localhost:${port}`);
}

bootstrap().catch((err) => {
  new Logger('Bootstrap').error('Fatal startup error', err);
  process.exit(1);
});