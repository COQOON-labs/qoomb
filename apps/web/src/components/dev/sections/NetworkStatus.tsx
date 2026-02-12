import { cn, useOnlineStatus } from '@qoomb/ui';

export function NetworkStatus() {
  const isOnline = useOnlineStatus();

  const dotClass = isOnline
    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]'
    : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]';

  return (
    <div className="p-4 border-b border-white/8">
      <h3 className="text-primary text-[13px] font-black mb-3 uppercase tracking-[0.08em]">
        📡 Network Status
      </h3>

      <div className="text-[13px]">
        {/* Online Status */}
        <div className="flex items-center gap-2 mb-3">
          <div className={cn('w-2.5 h-2.5 rounded-full', dotClass)} />
          <span className="text-white/75 font-semibold">{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Connection Type */}
        <div>
          <span className="text-white/40 text-xs">Connection Type:</span>
          <div className="text-white/75 bg-dev-surface px-2 py-1.5 rounded mt-1 text-xs font-mono">
            {(navigator as Navigator & { connection?: { effectiveType?: string } }).connection
              ?.effectiveType ?? 'Unknown'}
          </div>
        </div>
      </div>
    </div>
  );
}
