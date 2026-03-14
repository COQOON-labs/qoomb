import { Module } from '@nestjs/common';

import { EncryptionModule } from '../encryption';

import { ListsService } from './lists.service';

@Module({
  imports: [EncryptionModule],
  providers: [ListsService],
  exports: [ListsService],
})
export class ListsModule {}
