import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from './cache/cache.module';
import { QueueModule } from './queue/queue.module';

import { CircuitBreakerModule } from './common/circuit-breaker/circuit-breaker.module';
import { EmbeddingModule } from './common/embedding/embedding.module';
import { LlmModule } from './common/llm/llm.module';
import { PolicyModule } from './common/policy/policy.module';
import { TierThrottlerGuard } from './common/policy/tier-throttler.guard';
import { LoggerModule } from './common/logger/logger.module';
import { MetricsModule } from './common/metrics/prometheus.module';
import { RolesGuard } from './common/guards/roles.guard';


import { IdempotencyModule } from './idempotency/idempotency.module';
import { WebhookModule } from './webhook/webhook.module';
import { AuthModule } from './auth/auth.module';
import { TasksModule } from './tasks/tasks.module';
import { WebsocketModule } from './websocket/websocket.module';
import { ExecutionEventBusModule } from './event-bus/execution-event-bus.module';

import { PlanningModule } from './planning/planning.module';
import { ExecutionModule } from './execution/execution.module';
import { MemoryModule } from './memory/memory.module';
import { AgentModule } from './agent/agent.module';
import { FoodModule } from './food/food.module';
import { CalendarModule } from './calendar/calendar.module';
import { DigitalTwinModule } from './digital-twin/digital-twin.module';
import { HealthModule } from './health/health.module';
import { EmailModule } from './email/email.module';
import { VaultModule } from './vault/vault.module';
import { VoiceModule } from './voice/voice.module';

import { AuditModule } from './audit/audit.module';
import { ConfirmationModule } from './confirmation/confirmation.module';
import { AdminModule } from './admin/admin.module';
import { BillingModule } from './billing/billing.module';
import { GdprModule } from './gdpr/gdpr.module';
import { TeamsModule } from './teams/teams.module';

import { IdempotencyGuard } from './idempotency/idempotency.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
      cache: true,
      expandVariables: true,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

    PrismaModule,
    CacheModule,
    PolicyModule,
    LlmModule,
    EmbeddingModule,
    QueueModule,
    CircuitBreakerModule,
    IdempotencyModule,
    WebhookModule,

    LoggerModule,
    MetricsModule,

    AuthModule,
    TasksModule,
    WebsocketModule,
    ExecutionEventBusModule,

    PlanningModule,
    ExecutionModule,
    MemoryModule,
    AgentModule,
    FoodModule,
    DigitalTwinModule,
    HealthModule,
    CalendarModule,
    EmailModule,
    VaultModule,
    VoiceModule,
    AuditModule,
    AdminModule,
    BillingModule,
    GdprModule,
    TeamsModule,
    ConfirmationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: TierThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: IdempotencyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
