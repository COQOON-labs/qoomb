import {
  registerSchema,
  loginSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  sendInvitationSchema,
  registerWithInviteSchema,
  updateLocaleSchema,
} from '@qoomb/validators';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { REFRESH_TOKEN_COOKIE } from '../../config/security.config';
import { type TrpcContext } from '../../trpc/trpc.context';
import { router, publicProcedure, protectedProcedure } from '../../trpc/trpc.router';
import { requireEnabled } from '../../trpc/guards';

import { type AuthService } from './auth.service';
import { type PassKeyService } from './passkey.service';
import { type SystemConfigService } from './system-config.service';

// ── Cookie helpers ──────────────────────────────────────────────────────────

/**
 * Minimal interface for the cookie methods added by @fastify/cookie.
 * Using an explicit interface avoids requiring the web app (which imports
 * the router type) to resolve @fastify/cookie types.
 */
interface CookieReply {
  setCookie(name: string, value: string, opts: Record<string, unknown>): unknown;
  clearCookie(name: string, opts: Record<string, unknown>): unknown;
}

/**
 * Set the refresh token in an HttpOnly cookie on the response.
 * The cookie is never accessible to client-side JavaScript (CWE-922).
 *
 * Accepts `unknown` to avoid leaking @fastify/cookie types into the
 * app router type that the web frontend imports.
 */
function setRefreshCookie(res: unknown, token: string): void {
  (res as CookieReply | undefined)?.setCookie(REFRESH_TOKEN_COOKIE.NAME, token, {
    httpOnly: REFRESH_TOKEN_COOKIE.HTTP_ONLY,
    secure: REFRESH_TOKEN_COOKIE.SECURE,
    sameSite: REFRESH_TOKEN_COOKIE.SAME_SITE,
    path: REFRESH_TOKEN_COOKIE.PATH,
    maxAge: REFRESH_TOKEN_COOKIE.MAX_AGE_SECONDS,
  });
}

/** Clear the refresh token cookie (e.g. on logout). */
function clearRefreshCookie(res: unknown): void {
  (res as CookieReply | undefined)?.clearCookie(REFRESH_TOKEN_COOKIE.NAME, {
    httpOnly: REFRESH_TOKEN_COOKIE.HTTP_ONLY,
    secure: REFRESH_TOKEN_COOKIE.SECURE,
    sameSite: REFRESH_TOKEN_COOKIE.SAME_SITE,
    path: REFRESH_TOKEN_COOKIE.PATH,
  });
}

/** Read the refresh token from the request cookie. */
function readRefreshCookie(ctx: TrpcContext): string | undefined {
  return (ctx.req as unknown as { cookies?: Record<string, string> })?.cookies?.[
    REFRESH_TOKEN_COOKIE.NAME
  ];
}

/**
 * Strip the refresh token from a service result before returning to the client.
 * The refresh token is sent via HttpOnly cookie — never in the JSON body.
 */
function omitRefreshToken<T extends { refreshToken: string }>(result: T): Omit<T, 'refreshToken'> {
  const { refreshToken: _rt, ...rest } = result;
  return rest;
}

// ── Router ──────────────────────────────────────────────────────────────────

/**
 * Authentication Router
 *
 * Handles user registration, login, token validation, system config, and PassKeys.
 */
export const authRouter = (
  authService: AuthService,
  systemConfigService: SystemConfigService,
  passKeyService: PassKeyService
) =>
  router({
    /**
     * Get public system configuration flags.
     *
     * Used by the frontend to conditionally show/hide registration,
     * forgot-password, and PassKey UI elements before authentication.
     */
    getSystemConfig: publicProcedure.query(() => {
      return systemConfigService.getConfig();
    }),
    /**
     * Register a new hive with an admin user
     *
     * Creates:
     * 1. New hive record
     * 2. Dedicated hive schema in database
     * 3. Admin user account
     * 4. Admin person record in hive schema
     *
     * Returns access token (15 min). Refresh token is set as HttpOnly cookie.
     */
    register: publicProcedure.input(registerSchema).mutation(async ({ input, ctx }) => {
      requireEnabled(
        systemConfigService.isOpenRegistrationAllowed(),
        'Open registration is disabled on this instance.'
      );

      try {
        // Extract IP and User-Agent for device tracking
        const ipAddress: string | undefined = ctx.req?.ip ?? undefined;
        const userAgent: string | undefined = ctx.req?.headers?.['user-agent'] ?? undefined;

        // Map registerSchema to CreateHiveInput
        const name: string = input.hiveName;
        const adminEmail: string = input.email;
        const adminPassword: string = input.password;
        const adminName: string = input.adminName;

        const result = await authService.register(
          {
            name,
            type: input.hiveType,
            adminEmail,
            adminPassword,
            adminName,
          },
          ipAddress,
          userAgent
        );

        setRefreshCookie(ctx.res, result.refreshToken);
        return omitRefreshToken(result);
      } catch (error) {
        // Handle known errors
        if (error instanceof Error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }

        // Unknown error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Registration failed',
        });
      }
    }),

    /**
     * Login with email and password
     *
     * Validates credentials and returns access token (15 min).
     * Refresh token (7 days) is set as HttpOnly cookie.
     */
    login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
      try {
        // Extract IP and User-Agent for device tracking
        const ipAddress: string | undefined = ctx.req?.ip ?? undefined;
        const userAgent: string | undefined = ctx.req?.headers?.['user-agent'] ?? undefined;

        const email: string = input.email;
        const password: string = input.password;

        const result = await authService.login(email, password, ipAddress, userAgent);

        setRefreshCookie(ctx.res, result.refreshToken);
        return omitRefreshToken(result);
      } catch (_error) {
        // Don't leak information about whether email exists
        // Always return generic "Invalid credentials" message
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid credentials',
        });
      }
    }),

    /**
     * Refresh access token using refresh token from HttpOnly cookie.
     *
     * Implements token rotation:
     * - Old refresh token is revoked
     * - New refresh token is issued (set as HttpOnly cookie)
     * - New access token is issued (returned in JSON body)
     */
    refresh: publicProcedure.mutation(async ({ ctx }) => {
      try {
        const refreshToken = readRefreshCookie(ctx);
        if (!refreshToken) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'No refresh token',
          });
        }

        // Extract IP and User-Agent for device tracking
        const ipAddress: string | undefined = ctx.req?.ip ?? undefined;
        const userAgent: string | undefined = ctx.req?.headers?.['user-agent'] ?? undefined;

        const result = await authService.refresh(refreshToken, ipAddress, userAgent);

        setRefreshCookie(ctx.res, result.refreshToken);
        return omitRefreshToken(result);
      } catch (_error) {
        // Clear stale cookie on failure so the client doesn't retry in a loop
        clearRefreshCookie(ctx.res);
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired refresh token',
        });
      }
    }),

    /**
     * Logout - revoke current session
     *
     * Revokes the refresh token (from HttpOnly cookie) and blacklists the access token.
     *
     * DESIGN NOTE: publicProcedure (not protectedProcedure) is intentional.
     * - Logout must work even when the access token has already expired.
     * - The caller proves identity by presenting the tokens themselves.
     * - Passing random tokens is harmless: revocation is a no-op for unknown tokens.
     * - Follows RFC 7009 (OAuth token revocation) which also requires no pre-auth.
     */
    logout: publicProcedure
      .input(
        z.object({
          accessToken: z.string().min(1, 'Access token is required'),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const refreshToken = readRefreshCookie(ctx) ?? '';
          await authService.logout(input.accessToken, refreshToken);
          clearRefreshCookie(ctx.res);
          return { success: true, message: 'Logged out successfully' };
        } catch (_error) {
          // Always clear the cookie on logout, even if server-side revocation fails
          clearRefreshCookie(ctx.res);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Logout failed',
          });
        }
      }),

    /**
     * Logout from all devices
     *
     * Revokes all refresh tokens and blacklists all access tokens for the user
     */
    logoutAll: protectedProcedure.mutation(async ({ ctx }) => {
      try {
        await authService.logoutAll(ctx.user.id);
        clearRefreshCookie(ctx.res);
        return {
          success: true,
          message: 'Logged out from all devices successfully',
        };
      } catch (_error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Logout from all devices failed',
        });
      }
    }),

    /**
     * Get active sessions for the current user
     *
     * Returns list of all active refresh tokens with device information
     */
    getActiveSessions: protectedProcedure.query(async ({ ctx }) => {
      try {
        const userId: string = ctx.user.id;
        const sessions = await authService.getActiveSessions(userId);
        return { sessions };
      } catch (_error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve active sessions',
        });
      }
    }),

    /**
     * Get current user information
     *
     * Requires authentication
     * Returns user and hive information from JWT context
     */
    me: protectedProcedure.query(async ({ ctx }) => {
      const id: string = ctx.user.id;
      const email: string | undefined = ctx.user.email;
      const hiveId: string = ctx.user.hiveId;
      const personId: string | undefined = ctx.user.personId;
      const hiveName: string | undefined = ctx.user.hiveName;

      // Fetch live fields not present in JWT
      const dbUser = await ctx.prisma.user.findUnique({
        where: { id },
        select: { emailVerified: true, isSystemAdmin: true },
      });

      return {
        user: {
          id,
          email,
          hiveId,
          personId,
          hiveName,
          emailVerified: dbUser?.emailVerified ?? false,
          isSystemAdmin: dbUser?.isSystemAdmin ?? false,
          locale: ctx.user.locale,
        },
      };
    }),

    /**
     * Update the current user's locale preference (BCP 47 tag).
     */
    updateLocale: protectedProcedure.input(updateLocaleSchema).mutation(async ({ input, ctx }) => {
      try {
        return await authService.updateUserLocale(ctx.user.id, input.locale, ctx.user.hiveId);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to update locale',
        });
      }
    }),

    /**
     * Switch to a different hive
     *
     * Generates a new access token for the specified hive
     * User must have membership in the target hive
     */
    switchHive: protectedProcedure
      .input(
        z.object({
          hiveId: z.string().uuid('Invalid hive ID'),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const userId: string = ctx.user.id;
          const result = await authService.switchHive(userId, input.hiveId);
          return result;
        } catch (_error) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'No access to this hive',
          });
        }
      }),

    /**
     * Get all hives for the current user
     *
     * Returns list of all hives the user has access to
     */
    getUserHives: protectedProcedure.query(async ({ ctx }) => {
      try {
        const userId: string = ctx.user.id;
        const hives = await authService.getUserHives(userId);
        return { hives };
      } catch (_error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve user hives',
        });
      }
    }),

    /**
     * Validate a JWT token
     *
     * Used for token refresh and validation
     * Can be called without authentication (validates the token itself)
     */
    validateToken: publicProcedure
      .input(
        z.object({
          token: z.string(),
        })
      )
      .query(async ({ input }) => {
        try {
          const user = await authService.validateToken(input.token);
          return { valid: true, user };
        } catch (_error) {
          return { valid: false, user: null };
        }
      }),

    /**
     * Request a password reset email
     * Always returns success to prevent email enumeration
     */
    requestPasswordReset: publicProcedure
      .input(requestPasswordResetSchema)
      .mutation(async ({ input }) => {
        requireEnabled(
          systemConfigService.isForgotPasswordAllowed(),
          'Password reset is disabled on this instance.'
        );
        await authService.requestPasswordReset(input.email);
        return { success: true };
      }),

    /**
     * Reset password using a token from email
     */
    resetPassword: publicProcedure.input(resetPasswordSchema).mutation(async ({ input }) => {
      requireEnabled(
        systemConfigService.isForgotPasswordAllowed(),
        'Password reset is disabled on this instance.'
      );
      try {
        await authService.resetPassword(input.token, input.newPassword);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Password reset failed',
        });
      }
    }),

    /**
     * Verify email address using a token from email
     */
    verifyEmail: publicProcedure.input(verifyEmailSchema).mutation(async ({ input }) => {
      try {
        await authService.verifyEmail(input.token);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Email verification failed',
        });
      }
    }),

    /**
     * Resend email verification for the authenticated user
     */
    sendEmailVerification: protectedProcedure.mutation(async ({ ctx }) => {
      await authService.sendEmailVerification(ctx.user.id);
      return { success: true };
    }),

    /**
     * Send an invitation link to an email address (SystemAdmin only)
     */
    sendInvitation: protectedProcedure
      .input(sendInvitationSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          await authService.sendInvitation(ctx.user.id, input.email, input.hiveId);
          return { success: true };
        } catch (error) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: error instanceof Error ? error.message : 'Failed to send invitation',
          });
        }
      }),

    /**
     * Register a new user via an invitation token
     */
    registerWithInvitation: publicProcedure
      .input(registerWithInviteSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const ipAddress: string | undefined = ctx.req?.ip ?? undefined;
          const userAgent: string | undefined = ctx.req?.headers?.['user-agent'] ?? undefined;

          const { inviteToken, ...hiveInput } = input;
          const result = await authService.registerWithInvitation(
            inviteToken,
            {
              name: hiveInput.hiveName,
              type: hiveInput.hiveType,
              adminEmail: hiveInput.email,
              adminPassword: hiveInput.password,
              adminName: hiveInput.adminName,
            },
            ipAddress,
            userAgent
          );

          setRefreshCookie(ctx.res, result.refreshToken);
          return omitRefreshToken(result);
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : 'Registration failed',
          });
        }
      }),

    /**
     * PassKey sub-router
     */
    passkey: router({
      /**
       * Generate options to register a new PassKey (must be logged in)
       */
      generateRegOptions: protectedProcedure.mutation(async ({ ctx }) => {
        requireEnabled(
          systemConfigService.isPasskeysAllowed(),
          'PassKey authentication is disabled on this instance.'
        );
        try {
          const { id, email, hiveName } = ctx.user;
          return await passKeyService.generateRegistrationOptions(
            id,
            email ?? '',
            hiveName ?? email ?? ''
          );
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to generate options',
          });
        }
      }),

      /**
       * Verify PassKey registration response from the browser
       */
      verifyReg: protectedProcedure
        .input(
          z.object({
            response: z.unknown(),
            deviceName: z.string().trim().max(100).optional(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          try {
            return await passKeyService.verifyRegistration(
              ctx.user.id,
              input.response as Parameters<typeof passKeyService.verifyRegistration>[1],
              input.deviceName
            );
          } catch (error) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: error instanceof Error ? error.message : 'PassKey registration failed',
            });
          }
        }),

      /**
       * Generate options to authenticate with a PassKey (public)
       */
      generateAuthOptions: publicProcedure
        .input(z.object({ email: z.string().email().optional() }))
        .mutation(async ({ input }) => {
          requireEnabled(
            systemConfigService.isPasskeysAllowed(),
            'PassKey authentication is disabled on this instance.'
          );
          try {
            return await passKeyService.generateAuthenticationOptions(input.email);
          } catch (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error instanceof Error ? error.message : 'Failed to generate options',
            });
          }
        }),

      /**
       * Verify PassKey authentication response — returns tokens on success
       */
      verifyAuth: publicProcedure
        .input(
          z.object({
            sessionId: z.string().uuid(),
            response: z.unknown(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          try {
            const user = await passKeyService.verifyAuthentication(
              input.sessionId,
              input.response as Parameters<typeof passKeyService.verifyAuthentication>[1]
            );

            // Reuse authService helpers via the auth service method
            const result = await authService.loginWithPassKey(
              user,
              ctx.req?.ip ?? undefined,
              ctx.req?.headers?.['user-agent'] ?? undefined
            );

            setRefreshCookie(ctx.res, result.refreshToken);
            return omitRefreshToken(result);
          } catch (error) {
            throw new TRPCError({
              code: 'UNAUTHORIZED',
              message: error instanceof Error ? error.message : 'PassKey authentication failed',
            });
          }
        }),

      /**
       * List PassKeys for the authenticated user
       */
      list: protectedProcedure.query(async ({ ctx }) => {
        return passKeyService.listCredentials(ctx.user.id);
      }),

      /**
       * Remove a PassKey by its record ID
       */
      remove: protectedProcedure
        .input(z.object({ credentialId: z.string().uuid() }))
        .mutation(async ({ input, ctx }) => {
          try {
            await passKeyService.removeCredential(ctx.user.id, input.credentialId);
            return { success: true };
          } catch (error) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: error instanceof Error ? error.message : 'Failed to remove PassKey',
            });
          }
        }),
    }),
  });

/**
 * Auth router type export for client
 */
export type AuthRouter = ReturnType<typeof authRouter>;
