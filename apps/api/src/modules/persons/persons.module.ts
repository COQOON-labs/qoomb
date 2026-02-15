import { Module } from '@nestjs/common';

import { EncryptionModule } from '../encryption';

import { PersonsService } from './persons.service';

@Module({
  imports: [EncryptionModule],
  providers: [PersonsService],
  exports: [PersonsService],
})
export class PersonsModule {}
