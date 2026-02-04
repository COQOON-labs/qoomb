import { type FastifyRequest } from 'fastify';

import { type AuthService } from '../modules/auth/auth.service';
import { type PrismaService } from '../prisma/prisma.service';

export interface TrpcContext {
  prisma: PrismaService;
  authService: AuthService;
  req?: FastifyRequest;
  user?: {
    id: string;
    hiveId: string;
    personId?: string;
    email?: string;
    hiveName?: string;
  };
}

export function createTrpcContext(
  prisma: PrismaService,
  authService: AuthService,
  req?: FastifyRequest
): TrpcContext {
  return {
    prisma,
    authService,
    req,
  };
}
