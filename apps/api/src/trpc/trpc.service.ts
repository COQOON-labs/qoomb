import { Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ActivityService } from '../modules/activity/activity.service';
import { AuthService } from '../modules/auth/auth.service';
import { PassKeyService } from '../modules/auth/passkey.service';
import { SystemConfigService } from '../modules/auth/system-config.service';
import { EventsService } from '../modules/events/events.service';
import { GroupsService } from '../modules/groups/groups.service';
import { HiveService } from '../modules/hive/hive.service';
import { ListsService } from '../modules/lists/lists.service';
import { MessagingService } from '../modules/messaging/messaging.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { PersonsService } from '../modules/persons/persons.service';
import { PrismaService } from '../prisma/prisma.service';

import { createAppRouter } from './app.router';
import { createTrpcContext } from './trpc.context';

@Injectable()
export class TrpcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly systemConfigService: SystemConfigService,
    private readonly passKeyService: PassKeyService,
    private readonly personsService: PersonsService,
    private readonly eventsService: EventsService,
    private readonly groupsService: GroupsService,
    private readonly listsService: ListsService,
    private readonly hiveService: HiveService,
    private readonly notificationsService: NotificationsService,
    private readonly messagingService: MessagingService,
    private readonly activityService: ActivityService
  ) {}

  get router() {
    return createAppRouter(
      this.authService,
      this.systemConfigService,
      this.passKeyService,
      this.personsService,
      this.eventsService,
      this.groupsService,
      this.listsService,
      this.hiveService,
      this.notificationsService,
      this.messagingService,
      this.activityService
    );
  }

  createContext(req?: FastifyRequest, res?: FastifyReply) {
    return createTrpcContext(this.prisma, this.authService, req, res);
  }
}
