import { PrismaService } from '../prisma/prisma.service';

export interface TrpcContext {
  prisma: PrismaService;
  user?: {
    id: string;
    hiveId: string;
    personId?: string;
  };
}

export function createTrpcContext(prisma: PrismaService): TrpcContext {
  return {
    prisma,
  };
}
