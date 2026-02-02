import { All, Controller, Req, Res } from '@nestjs/common';
import { fastifyRequestHandler } from '@trpc/server/adapters/fastify';
import { TrpcService } from './trpc.service';
import type { FastifyReply, FastifyRequest } from 'fastify';

@Controller('trpc')
export class TrpcRouter {
  constructor(private readonly trpc: TrpcService) {}

  @All('/*')
  async handler(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    return fastifyRequestHandler({
      router: this.trpc.router,
      req,
      res,
      createContext: () => this.trpc.createContext(),
    });
  }
}
