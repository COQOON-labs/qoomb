import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { appRouter } from './app.router';
import { createTrpcContext } from './trpc.context';

@Injectable()
export class TrpcService {
  constructor(private readonly prisma: PrismaService) {}

  get router() {
    return appRouter;
  }

  createContext() {
    return createTrpcContext(this.prisma);
  }
}
