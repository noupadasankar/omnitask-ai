import { Module } from '@nestjs/common';
import {
  PrometheusModule as NestPrometheusModule,
  PrometheusController,
  makeCounterProvider,
  makeHistogramProvider,
  makeGaugeProvider,
} from '@willsoto/nestjs-prometheus';

export const httpRequestDuration = makeHistogramProvider({
  name: 'omnitask_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

export const httpRequestTotal = makeCounterProvider({
  name: 'omnitask_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

export const activeConnections = makeGaugeProvider({
  name: 'omnitask_active_connections',
  help: 'Active WebSocket connections',
});

export const queueDepth = makeGaugeProvider({
  name: 'omnitask_queue_depth',
  help: 'Bull queue depth by name',
  labelNames: ['queue'],
});

export const dbQueryDuration = makeHistogramProvider({
  name: 'omnitask_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['query'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

@Module({
  imports: [
    NestPrometheusModule.register({
      defaultMetrics: {
        enabled: true,
        config: { prefix: 'omnitask_' },
      },
      controller: PrometheusController,
    }),
  ],
  providers: [
    httpRequestDuration,
    httpRequestTotal,
    activeConnections,
    queueDepth,
    dbQueryDuration,
  ],
  exports: [
    httpRequestDuration,
    httpRequestTotal,
    activeConnections,
    queueDepth,
    dbQueryDuration,
  ],
})
export class MetricsModule {}
