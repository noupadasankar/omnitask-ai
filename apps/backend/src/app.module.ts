import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from './modules/auth/auth.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { PlanningModule } from './modules/planning/planning.module';
import { ExecutionModule } from './modules/execution/execution.module';
import { BrowserModule } from './modules/browser/browser.module';
import { FilesModule } from './modules/files/files.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { MemoryModule } from './modules/memory/memory.module';
import { AgentsModule } from './modules/agents/agents.module';
import { SkillsModule } from './modules/skills/skills.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { PoliciesModule } from './modules/policies/policies.module';
import { WsModule } from './shared/websocket/ws.module';
import { QueueModule } from './shared/queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        connection: { url: cfg.getOrThrow('REDIS_URL') },
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      }),
    }),
    AuthModule, TasksModule, PlanningModule, ExecutionModule,
    BrowserModule, FilesModule, ApprovalsModule, MemoryModule,
    AgentsModule, SkillsModule, SchedulerModule, PoliciesModule,
    WsModule, QueueModule,
  ],
})
export class AppModule {}