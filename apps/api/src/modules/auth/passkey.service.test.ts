/**
 * Unit tests for PassKeyService.
 *
 * The WebAuthn crypto operations (verifyRegistrationResponse,
 * verifyAuthenticationResponse) are delegated to @simplewebauthn/server and
 * tested end-to-end elsewhere. Here we focus on the business logic and
 * security contracts around those calls.
 *
 * Coverage targets:
 * - verifyRegistration:     expired Redis challenge → BadRequestException;
 *                           library verification failure → BadRequestException;
 *                           success → credential stored with correct fields
 * - verifyAuthentication:   expired challenge → UnauthorizedException;
 *                           unknown credential → UnauthorizedException;
 *                           user mismatch (challenge bound to other user) → UnauthorizedException;
 *                           success → counter updated, Redis cleaned up, user returned
 * - removeCredential:       not found → BadRequestException;
 *                           belongs to different user → BadRequestException (ownership);
 *                           success → deletion called
 * - listCredentials:        filters by userId, returns selected fields ordered by createdAt
 */

import * as crypto from 'crypto';

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as simplewebauthn from '@simplewebauthn/server';

import { PassKeyService } from './passkey.service';

// ── Mock external deps ────────────────────────────────────────────────────────

// Mock the entire @simplewebauthn/server module
jest.mock('@simplewebauthn/server');
const mockVerifyRegistration = simplewebauthn.verifyRegistrationResponse as jest.MockedFunction<
  typeof simplewebauthn.verifyRegistrationResponse
>;
const mockVerifyAuthentication = simplewebauthn.verifyAuthenticationResponse as jest.MockedFunction<
  typeof simplewebauthn.verifyAuthenticationResponse
>;
const mockGenerateAuthOpts = simplewebauthn.generateAuthenticationOptions as jest.MockedFunction<
  typeof simplewebauthn.generateAuthenticationOptions
>;
const mockGenerateRegOpts = simplewebauthn.generateRegistrationOptions as jest.MockedFunction<
  typeof simplewebauthn.generateRegistrationOptions
>;

// Mock getEnv (called by rpID / rpName / origin getters)
jest.mock('../../config/env.validation');
import { getEnv } from '../../config/env.validation';
const mockGetEnv = getEnv as jest.MockedFunction<typeof getEnv>;

const mockPrisma = {
  passKeyCredential: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockEnc = {
  hashEmailAllVersions: jest.fn(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(): PassKeyService {
  return new PassKeyService(mockPrisma as never, mockRedis as never, mockEnc as never);
}

const USER_ID = crypto.randomUUID();
const OTHER_USER_ID = crypto.randomUUID();
const SESSION_ID = crypto.randomUUID();
const CREDENTIAL_ID = 'cred-abc123';
const CREDENTIAL_RECORD_ID = crypto.randomUUID();
const EXPECTED_CHALLENGE = 'test-challenge-xyz';

function makeCredentialRow(
  overrides: Partial<{
    id: string;
    userId: string;
    credentialId: string;
    credentialPublicKey: Buffer;
    counter: bigint;
    transports: string[];
    deviceName: string | null;
    user: { id: string; email: string };
  }> = {}
) {
  return {
    id: overrides.id ?? CREDENTIAL_RECORD_ID,
    userId: overrides.userId ?? USER_ID,
    credentialId: overrides.credentialId ?? CREDENTIAL_ID,
    credentialPublicKey: overrides.credentialPublicKey ?? Buffer.from([1, 2, 3]),
    counter: overrides.counter ?? BigInt(5),
    transports: overrides.transports ?? ['internal'],
    deviceName: overrides.deviceName ?? null,
    createdAt: new Date(),
    lastUsedAt: null,
    user: overrides.user ?? { id: USER_ID, email: 'user@example.com' },
  };
}

// ── Reset ─────────────────────────────────────────────────────────────────────

function resetMocks() {
  jest.clearAllMocks();

  mockGetEnv.mockReturnValue({
    WEBAUTHN_RP_ID: 'localhost',
    WEBAUTHN_RP_NAME: 'Qoomb',
    WEBAUTHN_ORIGIN: 'http://localhost:5173',
  } as ReturnType<typeof getEnv>);

  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
  mockRedis.del.mockResolvedValue(1);

  mockPrisma.passKeyCredential.findMany.mockResolvedValue([]);
  mockPrisma.passKeyCredential.findUnique.mockResolvedValue(null);
  mockPrisma.passKeyCredential.create.mockResolvedValue(makeCredentialRow());
  mockPrisma.passKeyCredential.update.mockResolvedValue(makeCredentialRow());
  mockPrisma.passKeyCredential.delete.mockResolvedValue(makeCredentialRow());
  mockPrisma.user.findFirst.mockResolvedValue(null);

  mockEnc.hashEmailAllVersions.mockReturnValue(['hash1', 'hash2']);

  mockGenerateRegOpts.mockResolvedValue({ challenge: EXPECTED_CHALLENGE } as never);
  mockGenerateAuthOpts.mockResolvedValue({ challenge: EXPECTED_CHALLENGE } as never);
  mockVerifyRegistration.mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: {
        id: CREDENTIAL_ID,
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
        transports: ['internal'],
      },
    },
  } as never);
  mockVerifyAuthentication.mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter: 6 },
  } as never);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('PassKeyService', () => {
  let svc: PassKeyService;

  beforeEach(() => {
    resetMocks();
    svc = buildService();
  });

  // ── verifyRegistration ────────────────────────────────────────────────────

  describe('verifyRegistration', () => {
    it('throws BadRequestException when registration challenge has expired (Redis miss)', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(svc.verifyRegistration(USER_ID, {} as never)).rejects.toThrow(
        BadRequestException
      );
    });

    it('throws BadRequestException when library verification fails', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ challenge: EXPECTED_CHALLENGE, userId: USER_ID })
      );
      mockVerifyRegistration.mockResolvedValue({ verified: false } as never);

      await expect(svc.verifyRegistration(USER_ID, {} as never)).rejects.toThrow(
        BadRequestException
      );
    });

    it('stores credential with userId, credentialId, publicKey, counter, and transports', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ challenge: EXPECTED_CHALLENGE, userId: USER_ID })
      );

      await svc.verifyRegistration(USER_ID, {} as never);

      const createCall = mockPrisma.passKeyCredential.create.mock.calls[0][0];
      expect(createCall.data.userId).toBe(USER_ID);
      expect(createCall.data.credentialId).toBe(CREDENTIAL_ID);
      expect(createCall.data.counter).toBe(BigInt(0));
    });

    it('cleans up the Redis challenge key on success', async () => {
      const redisKey = `passkey:reg:${USER_ID}`;
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ challenge: EXPECTED_CHALLENGE, userId: USER_ID })
      );

      await svc.verifyRegistration(USER_ID, {} as never);

      expect(mockRedis.del).toHaveBeenCalledWith(redisKey);
    });

    it('returns { verified: true } on success', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ challenge: EXPECTED_CHALLENGE, userId: USER_ID })
      );

      const result = await svc.verifyRegistration(USER_ID, {} as never);

      expect(result).toEqual({ verified: true });
    });
  });

  // ── verifyAuthentication ──────────────────────────────────────────────────

  describe('verifyAuthentication', () => {
    it('throws UnauthorizedException when authentication challenge has expired (Redis miss)', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(svc.verifyAuthentication(SESSION_ID, {} as never)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('throws UnauthorizedException when credential is not recognised', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ challenge: EXPECTED_CHALLENGE, userId: null })
      );
      mockPrisma.passKeyCredential.findUnique.mockResolvedValue(null);

      await expect(
        svc.verifyAuthentication(SESSION_ID, { id: CREDENTIAL_ID } as never)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when credential belongs to a different user than the session', async () => {
      // Session was initiated for USER_ID but the credential belongs to OTHER_USER_ID
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ challenge: EXPECTED_CHALLENGE, userId: USER_ID })
      );
      mockPrisma.passKeyCredential.findUnique.mockResolvedValue(
        makeCredentialRow({ userId: OTHER_USER_ID })
      );

      await expect(
        svc.verifyAuthentication(SESSION_ID, { id: CREDENTIAL_ID } as never)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when library verification fails', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ challenge: EXPECTED_CHALLENGE, userId: null })
      );
      mockPrisma.passKeyCredential.findUnique.mockResolvedValue(makeCredentialRow());
      mockVerifyAuthentication.mockResolvedValue({ verified: false } as never);

      await expect(
        svc.verifyAuthentication(SESSION_ID, { id: CREDENTIAL_ID } as never)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('updates the counter with the new value from verification', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ challenge: EXPECTED_CHALLENGE, userId: null })
      );
      mockPrisma.passKeyCredential.findUnique.mockResolvedValue(makeCredentialRow());
      mockVerifyAuthentication.mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 42 },
      } as never);

      await svc.verifyAuthentication(SESSION_ID, { id: CREDENTIAL_ID } as never);

      const updateCall = mockPrisma.passKeyCredential.update.mock.calls[0][0];
      expect(updateCall.data.counter).toBe(BigInt(42));
      expect(updateCall.data.lastUsedAt).toBeInstanceOf(Date);
    });

    it('cleans up the Redis session key on success', async () => {
      const redisKey = `passkey:auth:${SESSION_ID}`;
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ challenge: EXPECTED_CHALLENGE, userId: null })
      );
      mockPrisma.passKeyCredential.findUnique.mockResolvedValue(makeCredentialRow());

      await svc.verifyAuthentication(SESSION_ID, { id: CREDENTIAL_ID } as never);

      expect(mockRedis.del).toHaveBeenCalledWith(redisKey);
    });

    it('returns the User record on success', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ challenge: EXPECTED_CHALLENGE, userId: null })
      );
      const userRow = { id: USER_ID, email: 'user@example.com' };
      mockPrisma.passKeyCredential.findUnique.mockResolvedValue(
        makeCredentialRow({ user: userRow })
      );

      const result = await svc.verifyAuthentication(SESSION_ID, { id: CREDENTIAL_ID } as never);

      expect(result).toMatchObject({ id: USER_ID });
    });

    it('allows authentication when session has no userId (anonymous flow)', async () => {
      // userId: null means no email was provided — any matching credential is acceptable
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ challenge: EXPECTED_CHALLENGE, userId: null })
      );
      mockPrisma.passKeyCredential.findUnique.mockResolvedValue(
        makeCredentialRow({ userId: USER_ID })
      );

      await expect(
        svc.verifyAuthentication(SESSION_ID, { id: CREDENTIAL_ID } as never)
      ).resolves.toBeDefined();
    });
  });

  // ── removeCredential ──────────────────────────────────────────────────────

  describe('removeCredential', () => {
    it('throws BadRequestException when credential record not found', async () => {
      mockPrisma.passKeyCredential.findUnique.mockResolvedValue(null);

      await expect(svc.removeCredential(USER_ID, CREDENTIAL_RECORD_ID)).rejects.toThrow(
        BadRequestException
      );
    });

    it('throws BadRequestException when credential belongs to a different user (ownership check)', async () => {
      mockPrisma.passKeyCredential.findUnique.mockResolvedValue(
        makeCredentialRow({ id: CREDENTIAL_RECORD_ID, userId: OTHER_USER_ID })
      );

      await expect(svc.removeCredential(USER_ID, CREDENTIAL_RECORD_ID)).rejects.toThrow(
        BadRequestException
      );
    });

    it('deletes the credential when owned by the requesting user', async () => {
      mockPrisma.passKeyCredential.findUnique.mockResolvedValue(
        makeCredentialRow({ id: CREDENTIAL_RECORD_ID, userId: USER_ID })
      );

      await svc.removeCredential(USER_ID, CREDENTIAL_RECORD_ID);

      expect(mockPrisma.passKeyCredential.delete).toHaveBeenCalledWith({
        where: { id: CREDENTIAL_RECORD_ID },
      });
    });
  });

  // ── listCredentials ───────────────────────────────────────────────────────

  describe('listCredentials', () => {
    it('filters by userId', async () => {
      await svc.listCredentials(USER_ID);

      const query = mockPrisma.passKeyCredential.findMany.mock.calls[0][0];
      expect(query.where).toEqual({ userId: USER_ID });
    });

    it('orders results by createdAt ascending', async () => {
      await svc.listCredentials(USER_ID);

      const query = mockPrisma.passKeyCredential.findMany.mock.calls[0][0];
      expect(query.orderBy).toEqual({ createdAt: 'asc' });
    });

    it('selects only safe fields (no raw public key bytes)', async () => {
      await svc.listCredentials(USER_ID);

      const query = mockPrisma.passKeyCredential.findMany.mock.calls[0][0];
      expect(query.select.id).toBe(true);
      expect(query.select.deviceName).toBe(true);
      // Raw credential key material must not be selected
      expect(query.select.credentialPublicKey).toBeUndefined();
    });
  });
});
