import { Module } from '@nestjs/common';

import { ActivityModule } from '../modules/activity/activity.module';
import { AuthModule } from '../modules/auth/auth.module';
import { EventsModule } from '../modules/events/events.module';
import { GroupsModule } from '../modules/groups/groups.module';
import { HiveModule } from '../modules/hive/hive.module';
import { ListsModule } from '../modules/lists/lists.module';
import { MessagingModule } from '../modules/messaging/messaging.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { PersonsModule } from '../modules/persons/persons.module';
import { PrismaModule } from '../prisma/prisma.module';

import { TrpcRouter } from './trpc.controller';
import { TrpcService } from './trpc.service';

@Module({
  imports: [
    AuthModule,
    PersonsModule,
    EventsModule,
    GroupsModule,
    ListsModule,
    HiveModule,
    NotificationsModule,
    MessagingModule,
    ActivityModule,
    PrismaModule,
  ],
  controllers: [TrpcRouter],
  providers: [TrpcService],
})
export class TrpcModule {}
