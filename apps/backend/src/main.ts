import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { doubleCsrf } from 'csrf-csrf';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EtagInterceptor } from './common/interceptors/etag.interceptor';
import { PinoLoggerService } from './common/logger/pino-logger.service';
import { initSentry, setupSentryErrorHandler } from './sentry';
import express from 'express';

const WEAK_SECRET_PATTERNS = [
  'change_this_to_minimum_32_char_random_string_now',
  'another_different_32_char_random_string_here',
  'change-me',
  'changeme',
  'secret',
  'password',
  '123456',
  'qwerty',
];

function isWeakSecret(value: string): boolean {
  const lower = value.toLowerCase();
  return WEAK_SECRET_PATTERNS.some((p) => lower.includes(p)) || value.length < 16;
}

async function bootstrap() {
  const sentryInitialized = initSentry();

  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const pinoLogger = await app.resolve(PinoLoggerService);
  app.useLogger(pinoLogger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 4000;
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

  const isProduction = process.env.NODE_ENV === 'production';

  // ── Fail-fast: validate all required secrets at startup ──────────
  const secretsToCheck: { key: string; value: string | undefined; label: string }[] = [
    { key: 'JWT_SECRET', value: configService.get<string>('JWT_SECRET'), label: 'JWT_SECRET' },
    { key: 'JWT_REFRESH_SECRET', value: configService.get<string>('JWT_REFRESH_SECRET'), label: 'JWT_REFRESH_SECRET' },
    { key: 'CSRF_SECRET', value: configService.get<string>('CSRF_SECRET'), label: 'CSRF_SECRET' },
    { key: 'VAULT_MASTER_KEY', value: configService.get<string>('VAULT_MASTER_KEY'), label: 'VAULT_MASTER_KEY (AES-256-GCM vault key)' },
  ];

  for (const { key, value, label } of secretsToCheck) {
    if (!value) {
      const msg = `❌ ${label} is not defined. Add it to your .env file.`;
      if (isProduction) {
        logger.error(msg);
        throw new Error(msg);
      }
      logger.warn(`${msg} — allowing dev startup with a TEMPORARY fallback`);
      continue;
    }
    if (isWeakSecret(value)) {
      const msg = `❌ ${label} is weak (too short or a known placeholder). Use a cryptographically random 64-char hex string.`;
      if (isProduction) {
        logger.error(msg);
        throw new Error(msg);
      }
      logger.warn(`${msg} — allowing dev startup but this is INSECURE`);
    }
  }

  // Validate CSRF secret specifically (also used for CSRF middleware)
  const csrfSecret = configService.get<string>('CSRF_SECRET');

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(cookieParser());

  const { doubleCsrfProtection } = doubleCsrf({
    getSecret: () => csrfSecret ?? '',
    getSessionIdentifier: (req) => req.headers['x-forwarded-for'] as string || req.ip || 'unknown',
    cookieName: 'csrf-token',
    cookieOptions: {
      httpOnly: false,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] as string | undefined,
  });

  // CSRF only defends cookie-based sessions. This API uses Bearer JWTs in the
  // Authorization header — a header that CSRF attacks cannot set — so any request
  // that already carries a valid Bearer token is implicitly CSRF-safe.
  // We still protect cookie-only paths (e.g. OAuth callbacks) for belt-and-suspenders.
  const CSRF_EXEMPT = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (CSRF_EXEMPT.includes(req.path)) return next();
    // Bearer token → no CSRF risk; skip the middleware
    const auth = req.headers['authorization'] || '';
    if (auth.startsWith('Bearer ')) return next();
    doubleCsrfProtection(req, res, next);
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Omnitask API')
    .setDescription('Omnitask backend API')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('docs', app, document);
  }
  const allowedOrigins = [frontendUrl, 'http://localhost:3000'];
  // Loopback origins are only trusted outside production. In production a
  // credentialed request from http://localhost would otherwise be accepted.
  const loopbackOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        (!isProduction && loopbackOrigin.test(origin))
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
  app.useGlobalInterceptors(new EtagInterceptor());
  app.enableShutdownHooks();

  if (sentryInitialized) {
    setupSentryErrorHandler(app);
  }

  await app.listen(port);

  logger.log(`Backend running: http://localhost:${port}/api`);
}

bootstrap();
