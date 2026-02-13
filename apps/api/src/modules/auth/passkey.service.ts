import * as crypto from 'crypto';

import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import type { User } from '@prisma/client';

import { RedisService } from '../../common/services/redis.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Stored in Redis for the duration of a registration or authentication ceremony (5 min). */
interface PasskeyChallengeSession {
  challenge: string;
  userId: string | null; // null for anonymous (email-not-provided) authentication
}

@Injectable()
export class PassKeyService {
  private readonly logger = new Logger(PassKeyService.name);

  private get rpID(): string {
    return process.env.WEBAUTHN_RP_ID ?? 'localhost';
  }

  private get rpName(): string {
    return process.env.WEBAUTHN_RP_NAME ?? 'Qoomb';
  }

  private get origin(): string | string[] {
    const raw = process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:5173';
    // Support comma-separated origins for multi-origin setups
    return raw.includes(',') ? raw.split(',').map((s) => s.trim()) : raw;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService
  ) {}

  // ── Registration ────────────────────────────────────────────────────────────

  /**
   * Generate registration options for adding a new PassKey to an existing account.
   * Called while the user is authenticated.
   */
  async generateRegistrationOptions(userId: string, userEmail: string, userName: string) {
    const existingCredentials = await this.prisma.passKeyCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: new TextEncoder().encode(userId),
      userName: userEmail,
      userDisplayName: userName ?? userEmail,
      excludeCredentials: existingCredentials.map((c) => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    const session: PasskeyChallengeSession = {
      challenge: options.challenge,
      userId,
    };
    await this.redisService.set(`passkey:reg:${userId}`, JSON.stringify(session), 5 * 60);

    return options;
  }

  /**
   * Verify the registration response from the browser and persist the credential.
   */
  async verifyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    deviceName?: string
  ): Promise<{ verified: true }> {
    const raw = await this.redisService.get(`passkey:reg:${userId}`);
    if (!raw) {
      throw new BadRequestException('Registration challenge expired. Please try again.');
    }

    const { challenge: expectedChallenge } = JSON.parse(raw) as PasskeyChallengeSession;

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('PassKey registration could not be verified.');
    }

    await this.redisService.del(`passkey:reg:${userId}`);

    const { credential } = verification.registrationInfo;

    await this.prisma.passKeyCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        credentialPublicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports ?? [],
        deviceName: deviceName ?? null,
      },
    });

    this.logger.log(`PassKey registered for user ${userId}`);
    return { verified: true };
  }

  // ── Authentication ──────────────────────────────────────────────────────────

  /**
   * Generate authentication options.
   * If `email` is provided, the ceremony is restricted to credentials for that user.
   * Returns `options` (for the browser) and `sessionId` (sent back with the response).
   */
  async generateAuthenticationOptions(email?: string): Promise<{
    options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
    sessionId: string;
  }> {
    let userId: string | null = null;
    let allowCredentials: { id: string; transports: AuthenticatorTransportFuture[] }[] | undefined;

    if (email) {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (user) {
        userId = user.id;
        const credentials = await this.prisma.passKeyCredential.findMany({
          where: { userId: user.id },
          select: { credentialId: true, transports: true },
        });
        allowCredentials = credentials.map((c) => ({
          id: c.credentialId,
          transports: c.transports as AuthenticatorTransportFuture[],
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: 'preferred',
      allowCredentials,
    });

    const sessionId = crypto.randomUUID();
    const session: PasskeyChallengeSession = { challenge: options.challenge, userId };
    await this.redisService.set(`passkey:auth:${sessionId}`, JSON.stringify(session), 5 * 60);

    return { options, sessionId };
  }

  /**
   * Verify the authentication response from the browser.
   * Returns the authenticated `User` record for token generation by the caller.
   */
  async verifyAuthentication(
    sessionId: string,
    response: AuthenticationResponseJSON
  ): Promise<User> {
    const raw = await this.redisService.get(`passkey:auth:${sessionId}`);
    if (!raw) {
      throw new UnauthorizedException('Authentication challenge expired. Please try again.');
    }

    const { challenge: expectedChallenge, userId: sessionUserId } = JSON.parse(
      raw
    ) as PasskeyChallengeSession;

    const credential = await this.prisma.passKeyCredential.findUnique({
      where: { credentialId: response.id },
      include: { user: true },
    });

    if (!credential) {
      throw new UnauthorizedException('PassKey not recognised.');
    }

    // If we restricted the ceremony to a specific user, enforce it
    if (sessionUserId && credential.userId !== sessionUserId) {
      throw new UnauthorizedException('PassKey does not belong to the expected user.');
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.credentialPublicKey),
        counter: Number(credential.counter),
        transports: credential.transports as AuthenticatorTransportFuture[],
      },
    });

    if (!verification.verified || !verification.authenticationInfo) {
      throw new UnauthorizedException('PassKey authentication failed.');
    }

    // Update counter + lastUsedAt
    await this.prisma.passKeyCredential.update({
      where: { credentialId: credential.credentialId },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });

    await this.redisService.del(`passkey:auth:${sessionId}`);

    this.logger.log(`PassKey authentication verified for user ${credential.userId}`);
    return credential.user;
  }

  // ── Credential Management ───────────────────────────────────────────────────

  async listCredentials(userId: string) {
    return this.prisma.passKeyCredential.findMany({
      where: { userId },
      select: {
        id: true,
        credentialId: true,
        deviceName: true,
        transports: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async removeCredential(userId: string, credentialRecordId: string): Promise<void> {
    const credential = await this.prisma.passKeyCredential.findUnique({
      where: { id: credentialRecordId },
      select: { id: true, userId: true },
    });

    if (!credential || credential.userId !== userId) {
      throw new BadRequestException('PassKey not found.');
    }

    await this.prisma.passKeyCredential.delete({ where: { id: credentialRecordId } });
    this.logger.log(`PassKey ${credentialRecordId} removed for user ${userId}`);
  }
}
