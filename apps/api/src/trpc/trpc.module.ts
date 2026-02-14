import { Module } from '@nestjs/common';

import { AuthModule } from '../modules/auth/auth.module';
import { EventsModule } from '../modules/events/events.module';
import { GroupsModule } from '../modules/groups/groups.module';
import { PersonsModule } from '../modules/persons/persons.module';
import { TasksModule } from '../modules/tasks/tasks.module';
import { PrismaModule } from '../prisma/prisma.module';

import { TrpcRouter } from './trpc.controller';
import { TrpcService } from './trpc.service';

@Module({
  imports: [AuthModule, PersonsModule, EventsModule, TasksModule, GroupsModule, PrismaModule],
  controllers: [TrpcRouter],
  providers: [TrpcService],
})
export class TrpcModule {}
