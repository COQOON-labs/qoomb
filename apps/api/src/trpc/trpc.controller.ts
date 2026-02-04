import { All, Controller, Req, Res } from '@nestjs/common';
import { fastifyRequestHandler } from '@trpc/server/adapters/fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { TrpcService } from './trpc.service';

@Controller('trpc')
export class TrpcRouter {
  constructor(private readonly trpc: TrpcService) {}

  @All('*')
  async handler(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    // Extract the path after /trpc (without query string)
    const url = req.url.split('?')[0]; // Remove query string
    const path = url.replace(/^\/trpc\/?/, ''); // Remove /trpc prefix

    return fastifyRequestHandler({
      router: this.trpc.router,
      req,
      res,
      path,
      createContext: () => this.trpc.createContext(req),
    });
  }
}
