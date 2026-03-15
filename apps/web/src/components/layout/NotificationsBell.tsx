import { useNavigate } from 'react-router-dom';

import { BellIcon } from '../icons';
import { useAuth } from '../../lib/auth/useAuth';
import { trpc } from '../../lib/trpc/client';

// ── NotificationsBell ─────────────────────────────────────────────────────────

/**
 * Bell icon button with unread count badge.
 * Navigates to /notifications on click.
 * Polls every 60s for new notifications.
 */
export function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data } = trpc.notifications.countUnread.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const unreadCount = data?.count ?? 0;

  return (
    <button
      type="button"
      onClick={() => void navigate('/notifications')}
      className="relative p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
      aria-label={`Benachrichtigungen${unreadCount > 0 ? ` (${unreadCount} ungelesen)` : ''}`}
    >
      <BellIcon className="w-5 h-5" />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-black flex items-center justify-center leading-none">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
