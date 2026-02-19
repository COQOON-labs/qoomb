import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useI18nContext } from '../../i18n/i18n-react';
import { useAuth } from '../../lib/auth/useAuth';
import { LogOutIcon, UserIcon } from '../icons';

// ── Props ─────────────────────────────────────────────────────────────────────

interface UserMenuProps {
  /** Display name shown on the trigger button */
  displayName: string;
  /** Initials shown in the avatar circle */
  initials: string;
  /** Role label below the name */
  roleLabel: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function UserMenu({ displayName, initials, roleLabel }: UserMenuProps) {
  const { LL } = useI18nContext();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const onProfileClick = () => {
    setOpen(false);
    void navigate('/profile');
  };

  const onLogoutClick = () => {
    setOpen(false);
    void logout().then(() => navigate('/login'));
  };

  return (
    <div ref={menuRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer text-left"
      >
        <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-xs font-black text-primary-foreground shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate leading-tight">{displayName}</div>
          <div className="text-xs text-white/50 leading-tight mt-0.5 uppercase tracking-wide">
            {roleLabel}
          </div>
        </div>
      </button>

      {/* Popup menu */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1.5 mx-1 bg-foreground border border-white/15 rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-white/10">
            <div className="text-sm font-bold text-white truncate">{displayName}</div>
            <div className="text-xs text-white/40 truncate mt-0.5">{roleLabel}</div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={onProfileClick}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <UserIcon className="w-4 h-4 shrink-0" />
              {LL.layout.userMenu.profile()}
            </button>
            <button
              onClick={onLogoutClick}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-rose-400 hover:bg-white/10 transition-colors"
            >
              <LogOutIcon className="w-4 h-4 shrink-0" />
              {LL.layout.userMenu.logout()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
