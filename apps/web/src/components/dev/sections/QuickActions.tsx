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
    backgroundColor: '#1A1A18',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: 'rgba(255, 255, 255, 0.75)',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    width: '100%',
    transition: 'all 0.2s',
    textAlign: 'left',
  };

  return (
    <div style={{ padding: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
      <h3
        style={{
          color: '#F5C400',
          fontSize: '13px',
          fontWeight: '900',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
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
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = '#F5C400';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1A1A18';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
          }}
        >
          🗑️ Clear All Cache
        </button>

        {/* Clear Console */}
        <button
          onClick={clearConsole}
          style={buttonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = '#F5C400';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1A1A18';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
          }}
        >
          🧹 Clear Console
        </button>

        {/* Reload Page */}
        <button
          onClick={reloadPage}
          style={buttonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = '#F5C400';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1A1A18';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
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
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = '#F5C400';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1A1A18';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
          }}
        >
          🗄️ Open Prisma Studio
        </a>

        {/* Toggle Logs */}
        <button
          onClick={() => setShowLogs(!showLogs)}
          style={buttonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = '#F5C400';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1A1A18';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
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
            backgroundColor: '#111110',
            border: '1px solid rgba(255, 255, 255, 0.08)',
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
                color: 'rgba(255, 255, 255, 0.4)',
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
