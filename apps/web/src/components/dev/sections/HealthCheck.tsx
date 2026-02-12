import { cn } from '@qoomb/ui';

import { trpc } from '../../../lib/trpc/client';

export function HealthCheck() {
  const { data, isLoading, error, refetch } = trpc.health.useQuery(undefined, {
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const getStatusClasses = () => {
    if (isLoading) return 'bg-white/40 shadow-[0_0_8px_rgba(255,255,255,0.4)]';
    if (error) return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]';
    if (data?.status === 'ok') return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]';
    return 'bg-primary shadow-[0_0_8px_rgba(245,196,0,1)]';
  };

  const getStatusText = () => {
    if (isLoading) return 'Checking...';
    if (error) return 'Error';
    if (data?.status === 'ok') return 'Healthy';
    return 'Unknown';
  };

  return (
    <div className="p-4 border-b border-white/8">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-primary text-sm font-black m-0 uppercase tracking-widest">
          💓 Backend Health
        </h3>
        <button
          onClick={() => {
            void refetch();
          }}
          className="bg-transparent border border-white/15 text-white/60 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider cursor-pointer hover:border-primary hover:text-white/80 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className={cn('w-2.5 h-2.5 rounded-full', getStatusClasses())} />
        <span className="text-white/75 text-sm font-medium">{getStatusText()}</span>
      </div>

      {data && (
        <div className="text-xs font-mono">
          <div className="mb-2">
            <span className="text-white/40">Timestamp:</span>
            <div className="text-white/75 bg-dev-surface px-2 py-1 rounded mt-1">
              {new Date(data.timestamp).toLocaleString()}
            </div>
          </div>
          {data.localIp && (
            <div>
              <span className="text-white/40">Server IP:</span>
              <div className="text-white/75 bg-dev-surface px-2 py-1 rounded mt-1">
                {data.localIp}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="text-red-300 text-xs bg-red-950 p-2 rounded mt-2">{error.message}</div>
      )}
    </div>
  );
}
