import { Button } from '@qoomb/ui';
import { useState } from 'react';

import { useI18nContext } from '../../i18n/i18n-react';
import { trpc } from '../../lib/trpc/client';

/**
 * Soft-prompt banner shown below the Topbar when the user's email is unverified.
 * Non-blocking — users can dismiss it and continue using the app.
 */
export function EmailVerificationBanner() {
  const { LL } = useI18nContext();
  const [dismissed, setDismissed] = useState(false);

  const meQuery = trpc.auth.me.useQuery(undefined, { staleTime: 5 * 60_000 });
  const resendMutation = trpc.auth.sendEmailVerification.useMutation();

  if (dismissed || meQuery.isLoading || meQuery.data?.user.emailVerified) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
      <svg
        className="h-4 w-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>

      <span className="flex-1">{LL.layout.emailVerification.message()}</span>

      {resendMutation.isSuccess ? (
        <span className="text-xs">{LL.layout.emailVerification.sent()}</span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs font-semibold hover:bg-primary-hover shrink-0"
          isLoading={resendMutation.isPending}
          onClick={() => resendMutation.mutate()}
        >
          {LL.layout.emailVerification.resend()}
        </Button>
      )}

      <button
        onClick={() => setDismissed(true)}
        className="ml-1 rounded p-0.5 hover:bg-primary-hover transition-colors shrink-0"
        aria-label={LL.layout.emailVerification.dismiss()}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
