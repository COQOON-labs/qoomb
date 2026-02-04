import { Module, Global } from '@nestjs/common';

import { CustomThrottlerGuard } from './guards/custom-throttler.guard';
import { AccountLockoutService } from './services/account-lockout.service';
import { RedisService } from './services/redis.service';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { RedisThrottlerStorage } from './storage/redis-throttler.storage';

@Global()
@Module({
  providers: [
    RedisService,
    AccountLockoutService,
    TokenBlacklistService,
    RedisThrottlerStorage,
    CustomThrottlerGuard,
  ],
  exports: [
    RedisService,
    AccountLockoutService,
    TokenBlacklistService,
    RedisThrottlerStorage,
    CustomThrottlerGuard,
  ],
})
export class CommonModule {}
