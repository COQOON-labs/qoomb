import { Module } from '@nestjs/common';

import { EncryptionModule } from '../encryption';

import { TasksService } from './tasks.service';

@Module({
  imports: [EncryptionModule],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
