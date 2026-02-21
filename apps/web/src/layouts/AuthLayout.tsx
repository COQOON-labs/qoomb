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
 */
export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  const { LL } = useI18nContext();
  return (
    <>
      {/* ── Desktop: two-panel layout ─────────────────────────────── */}
      <div className="hidden lg:flex min-h-screen">
        {/* Left brand panel */}
        <div className="w-1/2 flex flex-col items-center justify-center bg-foreground p-12">
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

        {/* Right form panel */}
        <div className="flex-1 flex flex-col items-center justify-center bg-background px-6 py-12">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-black text-foreground mb-1">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>}
            {children}
          </div>
        </div>
      </div>

      {/* ── Mobile: dark background + card ────────────────────────── */}
      <div className="lg:hidden flex min-h-screen flex-col items-center justify-center bg-foreground px-6 py-12">
        <span
          className="text-5xl font-black tracking-widest text-primary uppercase select-none mb-10"
          aria-label="Qoomb"
        >
          {LL.common.brand()}
        </span>

        <div className="w-full max-w-sm bg-card rounded-xl p-6 shadow-2xl">
          <h1 className="text-2xl font-black text-foreground mb-1">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>}
          {children}
        </div>
      </div>
    </>
  );
}
