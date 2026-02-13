import {
  registerSchema,
  loginSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  sendInvitationSchema,
  registerWithInviteSchema,
} from '@qoomb/validators';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { router, publicProcedure, protectedProcedure } from '../../trpc/trpc.router';

import { type AuthService } from './auth.service';
import { type PassKeyService } from './passkey.service';
import { type SystemConfigService } from './system-config.service';

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
     * Returns access token (15 min) + refresh token (7 days)
     */
    register: publicProcedure.input(registerSchema).mutation(async ({ input, ctx }) => {
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

        return result;
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
     * Validates credentials and returns access token (15 min) + refresh token (7 days)
     */
    login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
      try {
        // Extract IP and User-Agent for device tracking
        const ipAddress: string | undefined = ctx.req?.ip ?? undefined;
        const userAgent: string | undefined = ctx.req?.headers?.['user-agent'] ?? undefined;

        const email: string = input.email;
        const password: string = input.password;

        const result = await authService.login(email, password, ipAddress, userAgent);

        return result;
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
     * Refresh access token using refresh token
     *
     * Implements token rotation:
     * - Old refresh token is revoked
     * - New refresh token is issued
     * - New access token is issued
     *
     * Returns new access token (15 min) + new refresh token (7 days)
     */
    refresh: publicProcedure
      .input(
        z.object({
          refreshToken: z.string().min(1, 'Refresh token is required'),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          // Extract IP and User-Agent for device tracking
          const ipAddress: string | undefined = ctx.req?.ip ?? undefined;
          const userAgent: string | undefined = ctx.req?.headers?.['user-agent'] ?? undefined;

          const result = await authService.refresh(input.refreshToken, ipAddress, userAgent);

          return result;
        } catch (_error) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired refresh token',
          });
        }
      }),

    /**
     * Logout - revoke current session
     *
     * Revokes the refresh token and blacklists the access token
     */
    logout: protectedProcedure
      .input(
        z.object({
          accessToken: z.string().min(1, 'Access token is required'),
          refreshToken: z.string().min(1, 'Refresh token is required'),
        })
      )
      .mutation(async ({ input }) => {
        try {
          await authService.logout(input.accessToken, input.refreshToken);
          return { success: true, message: 'Logged out successfully' };
        } catch (_error) {
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
        },
      };
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
        await authService.requestPasswordReset(input.email);
        return { success: true };
      }),

    /**
     * Reset password using a token from email
     */
    resetPassword: publicProcedure.input(resetPasswordSchema).mutation(async ({ input }) => {
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
          return result;
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
            return result;
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
