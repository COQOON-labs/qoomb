import { trpc } from '../../../lib/trpc/client';

export function HealthCheck() {
  const { data, isLoading, error, refetch } = trpc.health.useQuery(undefined, {
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const getStatusColor = () => {
    if (isLoading) return 'rgba(255, 255, 255, 0.4)';
    if (error) return '#ef4444';
    if (data?.status === 'ok') return '#10b981';
    return '#F5C400';
  };

  const getStatusText = () => {
    if (isLoading) return 'Checking...';
    if (error) return 'Error';
    if (data?.status === 'ok') return 'Healthy';
    return 'Unknown';
  };

  return (
    <div style={{ padding: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <h3
          style={{
            color: '#F5C400',
            fontSize: '13px',
            fontWeight: '900',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          💓 Backend Health
        </h3>
        <button
          onClick={() => {
            void refetch();
          }}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'rgba(255, 255, 255, 0.6)',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Refresh
        </button>
      </div>

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
            backgroundColor: getStatusColor(),
            boxShadow: `0 0 8px ${getStatusColor()}`,
          }}
        />
        <span style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: '13px', fontWeight: '500' }}>
          {getStatusText()}
        </span>
      </div>

      {data && (
        <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>Timestamp:</span>
            <div
              style={{
                color: 'rgba(255, 255, 255, 0.75)',
                backgroundColor: '#1A1A18',
                padding: '4px 8px',
                borderRadius: '4px',
                marginTop: '4px',
              }}
            >
              {new Date(data.timestamp).toLocaleString()}
            </div>
          </div>
          {data.localIp && (
            <div>
              <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>Server IP:</span>
              <div
                style={{
                  color: 'rgba(255, 255, 255, 0.75)',
                  backgroundColor: '#1A1A18',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  marginTop: '4px',
                }}
              >
                {data.localIp}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          style={{
            color: '#fca5a5',
            fontSize: '12px',
            backgroundColor: '#450a0a',
            padding: '8px',
            borderRadius: '4px',
            marginTop: '8px',
          }}
        >
          {error.message}
        </div>
      )}
    </div>
  );
}
