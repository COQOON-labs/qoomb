import { Module } from '@nestjs/common';

import { EncryptionModule } from '../encryption';

import { GroupsService } from './groups.service';

@Module({
  imports: [EncryptionModule],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
