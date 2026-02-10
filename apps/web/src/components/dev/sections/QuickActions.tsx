import { useState } from 'react';

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

  const buttonStyle: React.CSSProperties = {
    backgroundColor: '#1e293b',
    border: '1px solid #475569',
    color: '#cbd5e1',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    width: '100%',
    transition: 'all 0.2s',
  };

  return (
    <div style={{ padding: '16px', borderBottom: '1px solid #334155' }}>
      <h3
        style={{
          color: '#eab308',
          fontSize: '16px',
          fontWeight: '600',
          marginBottom: '12px',
        }}
      >
        ⚡ Quick Actions
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Clear All Cache */}
        <button
          onClick={() => {
            void clearCache();
          }}
          style={buttonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#334155';
            e.currentTarget.style.borderColor = '#eab308';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1e293b';
            e.currentTarget.style.borderColor = '#475569';
          }}
        >
          🗑️ Clear All Cache
        </button>

        {/* Clear Console */}
        <button
          onClick={clearConsole}
          style={buttonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#334155';
            e.currentTarget.style.borderColor = '#eab308';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1e293b';
            e.currentTarget.style.borderColor = '#475569';
          }}
        >
          🧹 Clear Console
        </button>

        {/* Reload Page */}
        <button
          onClick={reloadPage}
          style={buttonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#334155';
            e.currentTarget.style.borderColor = '#eab308';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1e293b';
            e.currentTarget.style.borderColor = '#475569';
          }}
        >
          🔄 Reload Page
        </button>

        {/* Prisma Studio */}
        <a
          href="http://localhost:5555"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...buttonStyle,
            textDecoration: 'none',
            textAlign: 'center',
            display: 'block',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#334155';
            e.currentTarget.style.borderColor = '#eab308';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1e293b';
            e.currentTarget.style.borderColor = '#475569';
          }}
        >
          🗄️ Open Prisma Studio
        </a>

        {/* Toggle Logs */}
        <button
          onClick={() => setShowLogs(!showLogs)}
          style={buttonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#334155';
            e.currentTarget.style.borderColor = '#eab308';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1e293b';
            e.currentTarget.style.borderColor = '#475569';
          }}
        >
          📋 {showLogs ? 'Hide' : 'Show'} Action Logs
        </button>
      </div>

      {/* Action Logs */}
      {showLogs && logs.length > 0 && (
        <div
          style={{
            marginTop: '12px',
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '8px',
            maxHeight: '150px',
            overflowY: 'auto',
          }}
        >
          {logs.map((log, idx) => (
            <div
              key={idx}
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#94a3b8',
                marginBottom: '4px',
              }}
            >
              {log}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
