import { useState, useRef, useEffect } from 'react';

import { useI18nContext } from '../../i18n/i18n-react';
import { useAuth } from '../../lib/auth/useAuth';
import { trpc } from '../../lib/trpc/client';

/**
 * Hive selector dropdown shown in the Topbar.
 * Only renders when the user belongs to more than one hive.
 */
export function HiveSwitcher() {
  const { LL } = useI18nContext();
  const { user, switchHive } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const hivesQuery = trpc.auth.getUserHives.useQuery(undefined, { staleTime: 60_000 });
  const switchMutation = trpc.auth.switchHive.useMutation({
    onSuccess: (data, variables) => {
      const hive = hivesQuery.data?.hives.find((h) => h.id === variables.hiveId);
      switchHive(data.hive.id, data.hive.name, hive?.personId ?? '', data.accessToken);
      setOpen(false);
    },
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hives = hivesQuery.data?.hives ?? [];
  if (hives.length <= 1) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium hover:bg-muted transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="max-w-[120px] truncate">
          {user?.hiveName ?? LL.layout.hiveSwitcher.selectHive()}
        </span>
        <svg
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-border bg-card shadow-lg py-1"
        >
          {hives.map((hive) => (
            <li key={hive.id}>
              <button
                role="option"
                aria-selected={hive.id === user?.hiveId}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors ${
                  hive.id === user?.hiveId ? 'font-semibold text-foreground' : 'text-foreground/80'
                }`}
                onClick={() => switchMutation.mutate({ hiveId: hive.id })}
                disabled={hive.id === user?.hiveId || switchMutation.isPending}
              >
                {hive.id === user?.hiveId && (
                  <svg
                    className="h-3.5 w-3.5 text-primary shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                {hive.id !== user?.hiveId && <span className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{hive.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
