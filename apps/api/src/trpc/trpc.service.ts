import { Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthService } from '../modules/auth/auth.service';
import { PassKeyService } from '../modules/auth/passkey.service';
import { SystemConfigService } from '../modules/auth/system-config.service';
import { EventsService } from '../modules/events/events.service';
import { GroupsService } from '../modules/groups/groups.service';
import { PersonsService } from '../modules/persons/persons.service';
import { TasksService } from '../modules/tasks/tasks.service';
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
    private readonly tasksService: TasksService,
    private readonly groupsService: GroupsService
  ) {}

  get router() {
    return createAppRouter(
      this.authService,
      this.systemConfigService,
      this.passKeyService,
      this.personsService,
      this.eventsService,
      this.tasksService,
      this.groupsService
    );
  }

  createContext(req?: FastifyRequest, res?: FastifyReply) {
    return createTrpcContext(this.prisma, this.authService, req, res);
  }
}
