import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: Implement task methods
  // - list
  // - get
  // - create
  // - update
  // - delete
  // - complete
}
