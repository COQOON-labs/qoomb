import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { JWT_CONFIG } from '../../config/security.config';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

import { AuthService } from './auth.service';
import { PassKeyService } from './passkey.service';
import { RefreshTokenService } from './refresh-token.service';
import { SystemConfigService } from './system-config.service';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRES_IN },
    }),
  ],
  providers: [AuthService, RefreshTokenService, SystemConfigService, PassKeyService],
  exports: [AuthService, RefreshTokenService, SystemConfigService, PassKeyService],
})
export class AuthModule {}
