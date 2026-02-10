import { useOnlineStatus } from '@qoomb/ui';

export function NetworkStatus() {
  const isOnline = useOnlineStatus();

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
        📡 Network Status
      </h3>

      <div style={{ fontSize: '14px' }}>
        {/* Online Status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: isOnline ? '#10b981' : '#ef4444',
              boxShadow: `0 0 8px ${isOnline ? '#10b981' : '#ef4444'}`,
            }}
          />
          <span style={{ color: '#cbd5e1', fontWeight: '500' }}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Connection Type */}
        <div>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>Connection Type:</span>
          <div
            style={{
              color: '#cbd5e1',
              backgroundColor: '#1e293b',
              padding: '6px 8px',
              borderRadius: '4px',
              marginTop: '4px',
              fontSize: '12px',
              fontFamily: 'monospace',
            }}
          >
            {(navigator as Navigator & { connection?: { effectiveType?: string } }).connection
              ?.effectiveType ?? 'Unknown'}
          </div>
        </div>
      </div>
    </div>
  );
}
