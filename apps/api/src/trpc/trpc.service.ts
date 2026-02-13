import { Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { AuthService } from '../modules/auth/auth.service';
import { PassKeyService } from '../modules/auth/passkey.service';
import { SystemConfigService } from '../modules/auth/system-config.service';
import { PrismaService } from '../prisma/prisma.service';

import { createAppRouter } from './app.router';
import { createTrpcContext } from './trpc.context';

@Injectable()
export class TrpcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly systemConfigService: SystemConfigService,
    private readonly passKeyService: PassKeyService
  ) {}

  get router() {
    return createAppRouter(this.authService, this.systemConfigService, this.passKeyService);
  }

  createContext(req?: FastifyRequest) {
    return createTrpcContext(this.prisma, this.authService, req);
  }
}
