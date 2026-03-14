/**
 * Tests for tRPC guard utilities.
 *
 * Coverage targets:
 * - requireEnabled: throws FORBIDDEN when disabled, passes when enabled
 * - requireEnabled: FORBIDDEN code and custom message are propagated correctly
 */

import { TRPCError } from '@trpc/server';

import { requireEnabled } from './guards';

describe('requireEnabled', () => {
  it('does not throw when allowed=true', () => {
    expect(() => requireEnabled(true, 'Feature is disabled')).not.toThrow();
  });

  it('throws TRPCError when allowed=false', () => {
    expect(() => requireEnabled(false, 'Feature is disabled')).toThrow(TRPCError);
  });

  it('thrown error has FORBIDDEN code', () => {
    let caught: unknown;
    try {
      requireEnabled(false, 'Feature is disabled');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).code).toBe('FORBIDDEN');
  });

  it('propagates the custom message into the error', () => {
    let caught: unknown;
    try {
      requireEnabled(false, 'Password reset is disabled by the operator');
    } catch (err) {
      caught = err;
    }
    expect((caught as TRPCError).message).toBe('Password reset is disabled by the operator');
  });

  it('works correctly for multiple feature flags independently', () => {
    expect(() => requireEnabled(true, 'Registration disabled')).not.toThrow();
    expect(() => requireEnabled(false, 'PassKeys disabled')).toThrow(TRPCError);
    expect(() => requireEnabled(true, 'Forgot password disabled')).not.toThrow();
  });
});
