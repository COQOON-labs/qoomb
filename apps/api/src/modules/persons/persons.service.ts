import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PersonsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: Implement person methods
  // - list
  // - get
  // - create
  // - update
  // - delete
}
