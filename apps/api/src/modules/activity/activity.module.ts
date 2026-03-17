import { Module } from '@nestjs/common';

import { EncryptionModule } from '../encryption';

import { ActivityService } from './activity.service';

@Module({
  imports: [EncryptionModule],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
