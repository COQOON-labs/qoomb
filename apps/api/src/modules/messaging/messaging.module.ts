import { Module } from '@nestjs/common';

import { EncryptionModule } from '../encryption';

import { MessagingService } from './messaging.service';

@Module({
  imports: [EncryptionModule],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
