import { Button } from '@qoomb/ui';
import { startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../lib/auth/useAuth';
import { trpc } from '../../lib/trpc/client';

interface PassKeyButtonProps {
  email?: string;
  redirectTo?: string;
}

/**
 * "Sign in with PassKey" button for the LoginPage.
 * Handles the full WebAuthn authentication ceremony.
 */
export function PassKeyButton({ email, redirectTo = '/dashboard' }: PassKeyButtonProps) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const generateOptions = trpc.auth.passkey.generateAuthOptions.useMutation();
  const verifyAuth = trpc.auth.passkey.verifyAuth.useMutation({
    onSuccess: (data) => {
      login(
        {
          id: data.user.id,
          email: data.user.email,
          hiveId: data.user.hiveId,
          personId: data.user.personId ?? '',
          hiveName: data.hive.name,
        },
        data.accessToken,
        data.refreshToken
      );
      void navigate(redirectTo, { replace: true });
    },
    onError: (err) => setError(err.message),
  });

  const isPending = generateOptions.isPending || verifyAuth.isPending;

  async function handleClick() {
    setError('');
    try {
      // Step 1: get options from server
      const { options, sessionId } = await generateOptions.mutateAsync({ email });

      // Step 2: browser WebAuthn ceremony
      const response = await startAuthentication({
        optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
      });

      // Step 3: verify with server → get tokens
      await verifyAuth.mutateAsync({ sessionId, response });
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        // User cancelled — don't show error
        return;
      }
      setError(err instanceof Error ? err.message : 'PassKey authentication failed');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        fullWidth
        isLoading={isPending}
        onClick={() => void handleClick()}
      >
        <svg
          className="mr-2 h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
          />
        </svg>
        Sign in with PassKey
      </Button>
      {error && <p className="text-xs text-destructive text-center">{error}</p>}
    </div>
  );
}
