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
    /** Resolved BCP 47 locale (user > hive > platform default > 'en-US') */
    locale?: string;
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

/**
 * Extract Bearer token from Authorization header.
 * Returns null if header is missing or malformed.
 */
function extractBearerToken(req?: FastifyRequest): string | null {
  const authHeader = req?.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7); // 'Bearer '.length === 7
}

/**
 * Create tRPC context for each request.
 *
 * Automatically extracts and validates the JWT from the Authorization header.
 * If the token is valid, `ctx.user` is populated; otherwise it stays undefined
 * (public procedures don't need auth, so this is not an error).
 */
export async function createTrpcContext(
  prisma: PrismaService,
  authService: AuthService,
  req?: FastifyRequest
): Promise<TrpcContext> {
  const token = extractBearerToken(req);

  if (!token) {
    return { prisma, authService, req };
  }

  try {
    const user = await authService.validateToken(token);
    return { prisma, authService, req, user };
  } catch {
    // Token invalid/expired/blacklisted — treat as unauthenticated.
    // protectedProcedure will throw UNAUTHORIZED if user is required.
    return { prisma, authService, req };
  }
}
