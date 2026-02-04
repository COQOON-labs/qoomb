import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { JWT_CONFIG } from '../../config/security.config';
import { PrismaModule } from '../../prisma/prisma.module';

import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRES_IN },
    }),
  ],
  providers: [AuthService, RefreshTokenService],
  exports: [AuthService, RefreshTokenService],
})
export class AuthModule {}
