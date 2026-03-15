import { Module } from '@nestjs/common';

import { EncryptionModule } from '../encryption';

import { NotificationsService } from './notifications.service';

@Module({
  imports: [EncryptionModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
