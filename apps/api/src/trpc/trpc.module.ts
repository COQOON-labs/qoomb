import { Module } from '@nestjs/common';

import { AuthModule } from '../modules/auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { TrpcRouter } from './trpc.controller';
import { TrpcService } from './trpc.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [TrpcRouter],
  providers: [TrpcService],
})
export class TrpcModule {}
