import { Module } from '@nestjs/common';

import { EncryptionModule } from '../encryption';

import { EventsService } from './events.service';

@Module({
  imports: [EncryptionModule],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
