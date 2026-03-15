import { Module } from '@nestjs/common';

import { EncryptionModule } from '../encryption';

import { HiveService } from './hive.service';

@Module({
  imports: [EncryptionModule],
  providers: [HiveService],
  exports: [HiveService],
})
export class HiveModule {}
