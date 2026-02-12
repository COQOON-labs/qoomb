import { useState } from 'react';

const actionBtn =
  'bg-dev-surface border border-white/[0.12] text-white/75 px-3 py-2 rounded-md cursor-pointer text-xs font-semibold w-full text-left hover:bg-white/8 hover:border-primary transition-all duration-200';

export function QuickActions() {
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const clearCache = async () => {
    // Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      addLog('✓ All caches cleared');
    }

    // Unregister service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
      addLog('✓ Service workers unregistered');
    }

    // Clear localStorage
    localStorage.clear();
    addLog('✓ LocalStorage cleared');

    // Clear sessionStorage
    sessionStorage.clear();
    addLog('✓ SessionStorage cleared');

    addLog('💡 Reload page to see changes');
  };

  const clearConsole = () => {
    // eslint-disable-next-line no-console
    console.clear();
    addLog('✓ Console cleared');
  };

  const reloadPage = () => {
    window.location.reload();
  };

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  return (
    <div className="p-4 border-b border-white/8">
      <h3 className="text-primary text-[13px] font-black mb-3 uppercase tracking-[0.08em]">
        ⚡ Quick Actions
      </h3>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => {
            void clearCache();
          }}
          className={actionBtn}
        >
          🗑️ Clear All Cache
        </button>

        <button onClick={clearConsole} className={actionBtn}>
          🧹 Clear Console
        </button>

        <button onClick={reloadPage} className={actionBtn}>
          🔄 Reload Page
        </button>

        <a
          href="http://localhost:5555"
          target="_blank"
          rel="noopener noreferrer"
          className={`${actionBtn} block text-center no-underline`}
        >
          🗄️ Open Prisma Studio
        </a>

        <button onClick={() => setShowLogs(!showLogs)} className={actionBtn}>
          📋 {showLogs ? 'Hide' : 'Show'} Action Logs
        </button>
      </div>

      {/* Action Logs */}
      {showLogs && logs.length > 0 && (
        <div className="mt-3 bg-dev-bg border border-white/8 rounded-md p-2 max-h-37.5 overflow-y-auto">
          {logs.map((log, idx) => (
            <div key={idx} className="text-[11px] font-mono text-white/40 mb-1">
              {log}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
