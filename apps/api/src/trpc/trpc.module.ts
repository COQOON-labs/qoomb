import { Module } from '@nestjs/common';
import { TrpcService } from './trpc.service';
import { TrpcRouter } from './trpc.controller';

@Module({
  providers: [TrpcService, TrpcRouter],
})
export class TrpcModule {}
