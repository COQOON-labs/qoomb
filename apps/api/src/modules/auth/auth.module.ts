import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { getEnv } from '../../config/env.validation';
import { JWT_CONFIG } from '../../config/security.config';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { EncryptionModule } from '../encryption';

import { AuthService } from './auth.service';
import { PassKeyService } from './passkey.service';
import { RefreshTokenService } from './refresh-token.service';
import { SystemConfigService } from './system-config.service';
import { TokenCleanupTask } from './token-cleanup.task';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    EncryptionModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const env = getEnv();
        const privateKey = Buffer.from(env.JWT_PRIVATE_KEY, 'base64').toString('utf8');
        const publicKey = Buffer.from(env.JWT_PUBLIC_KEY, 'base64').toString('utf8');
        return {
          privateKey,
          publicKey,
          signOptions: {
            algorithm: JWT_CONFIG.ALGORITHM,
            expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRES_IN,
          },
          verifyOptions: {
            algorithms: [JWT_CONFIG.ALGORITHM],
          },
        };
      },
    }),
  ],
  providers: [
    AuthService,
    RefreshTokenService,
    SystemConfigService,
    PassKeyService,
    TokenCleanupTask,
  ],
  exports: [AuthService, RefreshTokenService, SystemConfigService, PassKeyService],
})
export class AuthModule {}
