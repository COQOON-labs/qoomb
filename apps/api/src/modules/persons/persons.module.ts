import { Module } from '@nestjs/common';

import { EncryptionModule } from '../encryption';
import { NotificationsModule } from '../notifications/notifications.module';

import { PersonsService } from './persons.service';

@Module({
  imports: [EncryptionModule, NotificationsModule],
  providers: [PersonsService],
  exports: [PersonsService],
})
export class PersonsModule {}
