/**
 * Comprehensive unit tests for AuthService.
 *
 * Coverage targets:
 * - validateToken: happy path, blacklisted token, token without JTI (S-002),
 *   non-existent user, cross-hive access (wrong/missing hive), user-level blacklist
 * - login: happy path, wrong password, non-existent user, locked account, no membership
 * - logout: blacklists access token JTI, revokes refresh token
 * - logoutAll: revokes all refresh tokens and blacklists user
 */

import * as crypto from 'crypto';

// Set env vars BEFORE importing EncryptionService — KeyProviderFactory reads them at construction time.
process.env['KEY_PROVIDER'] = 'environment';
process.env['ENCRYPTION_KEY'] = crypto.randomBytes(32).toString('base64');

// pg-boss uses ESM which Jest (CommonJS) cannot parse — mock the whole module.
jest.mock('../email/email-queue.service');
// Also mock pg-boss directly so the ESM parse error doesn't surface.
jest.mock('pg-boss', () => ({}));
// Mock getEnv so tests don't require a valid .env setup
jest.mock('../../config/env.validation', () => ({
  getEnv: () => ({
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    DEFAULT_LOCALE: 'de-DE',
    JWT_PRIVATE_KEY: 'test-private-key',
    JWT_PUBLIC_KEY: 'test-public-key',
    ALLOW_OPEN_REGISTRATION: true,
    ALLOW_FORGOT_PASSWORD: true,
    ALLOW_PASSKEYS: true,
    KEY_PROVIDER: 'environment',
    ENCRYPTION_KEY: process.env['ENCRYPTION_KEY'] ?? '',
  }),
}));

import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { EncryptionService } from '../encryption/encryption.service';

import { AuthService } from './auth.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildEncService(): Promise<EncryptionService> {
  const enc = new EncryptionService();
  await enc.onModuleInit();
  return enc;
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

const jwtSecret = 'test-secret-key';

function makeJwtService(): JwtService {
  return new JwtService({ secret: jwtSecret, signOptions: { expiresIn: '15m' } });
}

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  hive: { create: jest.fn() },
  person: { create: jest.fn(), update: jest.fn() },
  userHiveMembership: { create: jest.fn(), findUnique: jest.fn() },
  emailVerificationToken: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
  setHiveSchema: jest.fn().mockResolvedValue(undefined),
};

const mockAccountLockout = {
  isLocked: jest.fn().mockResolvedValue({ locked: false }),
  recordFailedAttempt: jest.fn().mockResolvedValue({ isLocked: false }),
  resetAttempts: jest.fn().mockResolvedValue(undefined),
};

const mockTokenBlacklist = {
  isBlacklisted: jest.fn().mockResolvedValue(false),
  isUserBlacklisted: jest.fn().mockResolvedValue(false),
  blacklistToken: jest.fn().mockResolvedValue(undefined),
  blacklistAllUserTokens: jest.fn().mockResolvedValue(undefined),
};

const mockRefreshTokenService = {
  createRefreshToken: jest.fn().mockResolvedValue({ token: 'rt-token' }),
  rotateRefreshToken: jest.fn(),
  revokeToken: jest.fn().mockResolvedValue(undefined),
  revokeAllTokensForUser: jest.fn().mockResolvedValue(undefined),
  getActiveTokensForUser: jest.fn().mockResolvedValue([]),
};

const mockEmailService = { sendVerification: jest.fn(), sendPasswordReset: jest.fn() };
const mockEmailQueue = {
  enqueueVerification: jest.fn().mockResolvedValue(undefined),
  enqueuePasswordReset: jest.fn().mockResolvedValue(undefined),
};
const mockSystemConfig = {
  getConfig: jest.fn().mockReturnValue({ allowOpenRegistration: true }),
  isPassKeysAllowed: jest.fn().mockReturnValue(true),
};
const mockNotifications = { notifyHiveMembers: jest.fn() };

// ── Shared mock-reset helper ─────────────────────────────────────────────────

/**
 * Reset all mock call history and restore the safe defaults that every
 * describe block relies on.  Called in beforeEach instead of
 * jest.clearAllMocks() so that default mockResolvedValues survive the reset.
 */
function resetMocks() {
  // Clear call history on every mock function
  jest.clearAllMocks();

  // Restore defaults that clearAllMocks wiped
  mockPrisma.setHiveSchema.mockResolvedValue(undefined);
  mockAccountLockout.isLocked.mockResolvedValue({ locked: false });
  mockAccountLockout.recordFailedAttempt.mockResolvedValue({ isLocked: false });
  mockAccountLockout.resetAttempts.mockResolvedValue(undefined);
  mockTokenBlacklist.isBlacklisted.mockResolvedValue(false);
  mockTokenBlacklist.isUserBlacklisted.mockResolvedValue(false);
  mockTokenBlacklist.blacklistToken.mockResolvedValue(undefined);
  mockTokenBlacklist.blacklistAllUserTokens.mockResolvedValue(undefined);
  mockRefreshTokenService.createRefreshToken.mockResolvedValue({ token: 'rt-token' });
  mockRefreshTokenService.revokeToken.mockResolvedValue(undefined);
  mockRefreshTokenService.revokeAllTokensForUser.mockResolvedValue(undefined);
  mockRefreshTokenService.getActiveTokensForUser.mockResolvedValue([]);
  mockEmailQueue.enqueueVerification.mockResolvedValue(undefined);
  mockEmailQueue.enqueuePasswordReset.mockResolvedValue(undefined);
  mockSystemConfig.getConfig.mockReturnValue({ allowOpenRegistration: true });
}

async function buildAuthService(): Promise<{
  svc: AuthService;
  enc: EncryptionService;
  jwt: JwtService;
}> {
  const enc = await buildEncService();
  const jwt = makeJwtService();

  const svc = new AuthService(
    mockPrisma as never,
    jwt,
    mockAccountLockout as never,
    mockTokenBlacklist as never,
    mockRefreshTokenService as never,
    mockEmailService as never,
    mockEmailQueue as never,
    mockSystemConfig as never,
    enc,
    mockNotifications as never
  );

  return { svc, enc, jwt };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = crypto.randomUUID();
const HIVE_ID = crypto.randomUUID();
const PERSON_ID = crypto.randomUUID();

async function makeEncryptedUser(enc: EncryptionService) {
  const email = 'alice@example.com';
  const passwordHash = await bcrypt.hash('Correct-P@ss1', 10);
  return {
    id: USER_ID,
    email: enc.encryptForUser(email, USER_ID),
    emailHash: enc.hashEmail(email),
    passwordHash,
    fullName: enc.encryptForUser('Alice', USER_ID),
    isSystemAdmin: false,
    emailVerified: true,
    locale: null,
    memberships: [
      {
        userId: USER_ID,
        hiveId: HIVE_ID,
        personId: PERSON_ID,
        isPrimary: true,
        hive: {
          id: HIVE_ID,
          name: 'encrypted-hive-name', // not decrypted in tests — see decryptHiveName
          locale: null,
        },
        person: { id: PERSON_ID, role: 'parent' },
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// validateToken
// ═══════════════════════════════════════════════════════════════════════════════

describe('AuthService.validateToken', () => {
  let svc: AuthService;
  let enc: EncryptionService;
  let jwt: JwtService;

  beforeEach(async () => {
    resetMocks();
    ({ svc, enc, jwt } = await buildAuthService());
  });

  it('returns user context for a valid token', async () => {
    const user = await makeEncryptedUser(enc);
    const jti = crypto.randomUUID();
    const token = jwt.sign({
      sub: USER_ID,
      hiveId: HIVE_ID,
      personId: PERSON_ID,
      jti,
      type: 'access',
    });

    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.userHiveMembership.findUnique.mockResolvedValue(user.memberships[0]);

    // Patch decryptHiveName to avoid needing real encrypted hive name
    jest.spyOn(svc as never, 'decryptHiveName').mockReturnValue('Test Hive' as never);

    const result = await svc.validateToken(token);

    expect(result.id).toBe(USER_ID);
    expect(result.hiveId).toBe(HIVE_ID);
    expect(result.personId).toBe(PERSON_ID);
    expect(mockTokenBlacklist.isBlacklisted).toHaveBeenCalledWith(jti);
  });

  it('throws UnauthorizedException when JTI is missing (S-002)', async () => {
    // Token without jti — should be rejected before any DB call
    const tokenNoJti = jwt.sign({ sub: USER_ID, hiveId: HIVE_ID, type: 'access' });

    await expect(svc.validateToken(tokenNoJti)).rejects.toThrow(UnauthorizedException);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when token JTI is blacklisted', async () => {
    const jti = crypto.randomUUID();
    const token = jwt.sign({ sub: USER_ID, hiveId: HIVE_ID, jti, type: 'access' });
    mockTokenBlacklist.isBlacklisted.mockResolvedValue(true);

    await expect(svc.validateToken(token)).rejects.toThrow(UnauthorizedException);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when user-level blacklist is active', async () => {
    const jti = crypto.randomUUID();
    const token = jwt.sign({ sub: USER_ID, hiveId: HIVE_ID, jti, type: 'access' });
    mockTokenBlacklist.isUserBlacklisted.mockResolvedValue(true);

    await expect(svc.validateToken(token)).rejects.toThrow(UnauthorizedException);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when user does not exist', async () => {
    const jti = crypto.randomUUID();
    const token = jwt.sign({ sub: USER_ID, hiveId: HIVE_ID, jti, type: 'access' });
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(svc.validateToken(token)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when hive membership does not exist (cross-hive)', async () => {
    const user = await makeEncryptedUser(enc);
    const jti = crypto.randomUUID();
    const foreignHive = crypto.randomUUID();
    const token = jwt.sign({ sub: USER_ID, hiveId: foreignHive, jti, type: 'access' });

    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.userHiveMembership.findUnique.mockResolvedValue(null);

    await expect(svc.validateToken(token)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when token is expired', async () => {
    // Sign a token that expired 1 second ago
    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { sub: USER_ID, hiveId: HIVE_ID, jti, type: 'access' },
      { expiresIn: -1 }
    );

    await expect(svc.validateToken(token)).rejects.toThrow(UnauthorizedException);
    // Should not call DB for expired tokens
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when token has no hiveId', async () => {
    const user = await makeEncryptedUser(enc);
    const jti = crypto.randomUUID();
    const token = jwt.sign({ sub: USER_ID, jti, type: 'access' }); // no hiveId

    mockPrisma.user.findUnique.mockResolvedValue(user);

    await expect(svc.validateToken(token)).rejects.toThrow(UnauthorizedException);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// login
// ═══════════════════════════════════════════════════════════════════════════════

describe('AuthService.login', () => {
  let svc: AuthService;
  let enc: EncryptionService;

  beforeEach(async () => {
    resetMocks();
    mockRefreshTokenService.createRefreshToken.mockResolvedValue({ token: 'rt-abc' });
    ({ svc, enc } = await buildAuthService());
    jest.spyOn(svc as never, 'decryptHiveName').mockReturnValue('Test Hive' as never);
  });

  it('returns tokens and user data on successful login', async () => {
    const user = await makeEncryptedUser(enc);
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockAccountLockout.resetAttempts.mockResolvedValue(undefined);

    const result = await svc.login('alice@example.com', 'Correct-P@ss1');

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBe('rt-abc');
    expect(result.user.id).toBe(USER_ID);
    expect(result.user.hiveId).toBe(HIVE_ID);
    expect(result.user.personId).toBe(PERSON_ID);
  });

  it('throws UnauthorizedException for wrong password', async () => {
    const user = await makeEncryptedUser(enc);
    mockPrisma.user.findFirst.mockResolvedValue(user);

    await expect(svc.login('alice@example.com', 'WrongPass!')).rejects.toThrow(
      UnauthorizedException
    );
    expect(mockAccountLockout.recordFailedAttempt).toHaveBeenCalled();
  });

  it('throws UnauthorizedException for non-existent user (constant-time)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(svc.login('nobody@example.com', 'any-password')).rejects.toThrow(
      UnauthorizedException
    );
    // Should still call bcrypt compare (constant-time anti-enumeration)
    expect(mockAccountLockout.recordFailedAttempt).toHaveBeenCalled();
  });

  it('throws UnauthorizedException when account is locked', async () => {
    mockAccountLockout.isLocked.mockResolvedValue({ locked: true, remainingSeconds: 300 });

    await expect(svc.login('alice@example.com', 'any-password')).rejects.toThrow(
      UnauthorizedException
    );
    // Should not attempt DB lookup when account is locked
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when user has no memberships', async () => {
    const user = await makeEncryptedUser(enc);
    mockPrisma.user.findFirst.mockResolvedValue({ ...user, memberships: [] });
    mockAccountLockout.resetAttempts.mockResolvedValue(undefined);

    await expect(svc.login('alice@example.com', 'Correct-P@ss1')).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('locks account after repeated failures', async () => {
    const user = await makeEncryptedUser(enc);
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockAccountLockout.recordFailedAttempt.mockResolvedValue({
      isLocked: true,
      remainingLockoutSeconds: 600,
    });

    await expect(svc.login('alice@example.com', 'WrongPass!')).rejects.toThrow(
      UnauthorizedException
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// logout
// ═══════════════════════════════════════════════════════════════════════════════

describe('AuthService.logout', () => {
  let svc: AuthService;
  let jwt: JwtService;

  beforeEach(async () => {
    resetMocks();
    ({ svc, jwt } = await buildAuthService());
  });

  it('blacklists the access token JTI and revokes the refresh token', async () => {
    const jti = crypto.randomUUID();
    // Sign without the default expiresIn so we can control the exp claim manually.
    // Use a separate JwtService instance with no default expiresIn.
    const rawJwt = new JwtService({ secret: jwtSecret });
    const now = Math.floor(Date.now() / 1000);
    const accessToken = rawJwt.sign({
      sub: USER_ID,
      hiveId: HIVE_ID,
      jti,
      type: 'access',
      exp: now + 900,
    });

    await svc.logout(accessToken, 'rt-token');

    expect(mockTokenBlacklist.blacklistToken).toHaveBeenCalledWith(
      jti,
      expect.any(Number),
      'logout'
    );
    expect(mockRefreshTokenService.revokeToken).toHaveBeenCalledWith('rt-token');
  });

  it('still revokes refresh token even if access token has no JTI', async () => {
    const accessToken = jwt.sign({ sub: USER_ID, hiveId: HIVE_ID, type: 'access' });

    await svc.logout(accessToken, 'rt-token');

    expect(mockTokenBlacklist.blacklistToken).not.toHaveBeenCalled();
    expect(mockRefreshTokenService.revokeToken).toHaveBeenCalledWith('rt-token');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// logoutAll
// ═══════════════════════════════════════════════════════════════════════════════

describe('AuthService.logoutAll', () => {
  let svc: AuthService;

  beforeEach(async () => {
    resetMocks();
    ({ svc } = await buildAuthService());
  });

  it('revokes all refresh tokens and blacklists user', async () => {
    await svc.logoutAll(USER_ID);

    expect(mockRefreshTokenService.revokeAllTokensForUser).toHaveBeenCalledWith(USER_ID);
    expect(mockTokenBlacklist.blacklistAllUserTokens).toHaveBeenCalledWith(
      USER_ID,
      expect.any(Number)
    );
  });
});
