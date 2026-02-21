import type { ReactNode } from 'react';

import { useI18nContext } from '../i18n/i18n-react';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

/**
 * Shared layout for all auth pages.
 * Desktop: dark brand panel left, white form panel right.
 * Mobile: black background, yellow QOOMB above a centered form card.
 *
 * Children are rendered exactly once to avoid duplicate DOM inputs which
 * would break react-hook-form refs and make inputs unresponsive.
 */
export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  const { LL } = useI18nContext();
  return (
    <div className="min-h-screen flex">
      {/* Left brand panel (desktop only) */}
      <div className="hidden lg:flex w-1/2 flex-col items-center justify-center bg-foreground p-12">
        <span
          className="text-6xl font-black tracking-widest text-primary uppercase select-none"
          aria-label="Qoomb"
        >
          {LL.common.brand()}
        </span>
        <p className="mt-4 text-sm tracking-wide text-muted-foreground/60 uppercase">
          {LL.common.tagline()}
        </p>
      </div>

      {/* Right panel — full-width on mobile, half-width on desktop */}
      <div className="flex-1 flex flex-col items-center justify-center bg-foreground lg:bg-background px-6 py-12">
        {/* Mobile-only logo */}
        <span
          className="lg:hidden text-5xl font-black tracking-widest text-primary uppercase select-none mb-10"
          aria-label="Qoomb"
        >
          {LL.common.brand()}
        </span>

        {/* Form card: styled for mobile, transparent on desktop */}
        <div className="w-full max-w-sm bg-card lg:bg-transparent rounded-xl lg:rounded-none p-6 lg:p-0 shadow-2xl lg:shadow-none">
          <h1 className="text-2xl font-black text-foreground mb-1">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
