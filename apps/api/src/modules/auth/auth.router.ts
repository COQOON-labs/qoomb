import { registerSchema, loginSchema } from '@qoomb/validators';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { router, publicProcedure, protectedProcedure } from '../../trpc/trpc.router';

import { type AuthService } from './auth.service';

/**
 * Authentication Router
 *
 * Handles user registration, login, and token validation
 * All auth endpoints are public (no authentication required)
 */
export const authRouter = (authService: AuthService) =>
  router({
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
    me: protectedProcedure.query(({ ctx }) => {
      const id: string = ctx.user.id;
      const email: string | undefined = ctx.user.email;
      const hiveId: string = ctx.user.hiveId;
      const personId: string | undefined = ctx.user.personId;
      const hiveName: string | undefined = ctx.user.hiveName;

      return {
        user: {
          id,
          email,
          hiveId,
          personId,
          hiveName,
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
  });

/**
 * Auth router type export for client
 */
export type AuthRouter = ReturnType<typeof authRouter>;
