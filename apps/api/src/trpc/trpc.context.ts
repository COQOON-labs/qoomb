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
    /** Hive type string ('family' | 'organization') populated by hiveProcedure */
    hiveType?: string;
    /** Person role string populated by hiveProcedure */
    role?: string;
    /** Per-hive role permission overrides loaded by hiveProcedure from hive_role_permissions table */
    roleOverrides?: ReadonlyArray<{ permission: string; granted: boolean }>;
    /** Group IDs this person belongs to, loaded by hiveProcedure from hive_group_members */
    groupIds?: ReadonlyArray<string>;
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
