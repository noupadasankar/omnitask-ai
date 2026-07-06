import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import type { INestApplication } from '@nestjs/common';

export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || dsn === 'https://xxx@xxx.ingest.sentry.io/xxx') {
    return false;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 0.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.0,
    integrations: [nodeProfilingIntegration()],
    attachStacktrace: true,
    normalizeDepth: 10,
    maxBreadcrumbs: 100,
  });

  return true;
}

export function setupSentryErrorHandler(app: INestApplication): void {
  Sentry.setupExpressErrorHandler(app.getHttpAdapter().getInstance());
}
