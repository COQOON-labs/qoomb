import { useOnlineStatus } from '@qoomb/ui';

export function NetworkStatus() {
  const isOnline = useOnlineStatus();

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
        📡 Network Status
      </h3>

      <div style={{ fontSize: '13px' }}>
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
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: isOnline ? '#10b981' : '#ef4444',
              boxShadow: `0 0 8px ${isOnline ? '#10b981' : '#ef4444'}`,
            }}
          />
          <span style={{ color: 'rgba(255, 255, 255, 0.75)', fontWeight: '600' }}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Connection Type */}
        <div>
          <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '12px' }}>
            Connection Type:
          </span>
          <div
            style={{
              color: 'rgba(255, 255, 255, 0.75)',
              backgroundColor: '#1A1A18',
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
