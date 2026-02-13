import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { CommonModule } from './common/common.module';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { RedisThrottlerStorage } from './common/storage/redis-throttler.storage';
import { RATE_LIMITS } from './config/security.config';
import { AuthModule } from './modules/auth/auth.module';
import { EmailModule } from './modules/email/email.module';
import { EventsModule } from './modules/events/events.module';
import { PersonsModule } from './modules/persons/persons.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { PrismaModule } from './prisma/prisma.module';
import { TrpcModule } from './trpc/trpc.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    // Rate Limiting with Redis storage
    ThrottlerModule.forRootAsync({
      useFactory: (storage: RedisThrottlerStorage) => ({
        throttlers: [
          {
            name: 'default',
            ttl: RATE_LIMITS.GLOBAL.ttl * 1000, // Convert to milliseconds
            limit: RATE_LIMITS.GLOBAL.limit,
          },
        ],
        storage,
      }),
      inject: [RedisThrottlerStorage],
    }),
    CommonModule,
    PrismaModule,
    EmailModule,
    TrpcModule,
    AuthModule,
    EventsModule,
    TasksModule,
    PersonsModule,
  ],
  providers: [
    // Apply throttler guard globally
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
