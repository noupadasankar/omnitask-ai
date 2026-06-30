import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from './cache/cache.module';
import { QueueModule } from './queue/queue.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TasksModule } from './tasks/tasks.module';
import { FilesModule } from './files/files.module';
import { WebsocketModule } from './websocket/websocket.module';

import { PlanningModule } from './planning/planning.module';
import { ExecutionModule } from './execution/execution.module';
import { MemoryModule } from './memory/memory.module';
import { AgentModule } from './agent/agent.module';
import { JobModule } from './job/job.module';
import { ShoppingModule } from './shopping/shopping.module';
import { SocialModule } from './social/social.module';
import { TravelModule } from './travel/travel.module';
import { FoodModule } from './food/food.module';
import { DigitalTwinModule } from './digital-twin/digital-twin.module';
import { HealthModule } from './health/health.module';
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

    PrismaModule,
    CacheModule,
    QueueModule,

    AuthModule,
    UsersModule,
    TasksModule,
    FilesModule,
    WebsocketModule,

    PlanningModule,
    ExecutionModule,
    MemoryModule,
    AgentModule,
    JobModule,
    ShoppingModule,
    SocialModule,
    TravelModule,
    FoodModule,
    DigitalTwinModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
