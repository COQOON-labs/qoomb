import { Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { AuthService } from '../modules/auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

import { createAppRouter } from './app.router';
import { createTrpcContext } from './trpc.context';

@Injectable()
export class TrpcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  get router() {
    return createAppRouter(this.authService);
  }

  createContext(req?: FastifyRequest) {
    return createTrpcContext(this.prisma, this.authService, req);
  }
}
