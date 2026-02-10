import { trpc } from '../../../lib/trpc/client';

export function HealthCheck() {
  const { data, isLoading, error, refetch } = trpc.health.useQuery(undefined, {
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const getStatusColor = () => {
    if (isLoading) return '#94a3b8';
    if (error) return '#ef4444';
    if (data?.status === 'ok') return '#10b981';
    return '#f59e0b';
  };

  const getStatusText = () => {
    if (isLoading) return 'Checking...';
    if (error) return 'Error';
    if (data?.status === 'ok') return 'Healthy';
    return 'Unknown';
  };

  return (
    <div style={{ padding: '16px', borderBottom: '1px solid #334155' }}>
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
            color: '#eab308',
            fontSize: '16px',
            fontWeight: '600',
            margin: 0,
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
            border: '1px solid #475569',
            color: '#cbd5e1',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
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
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: getStatusColor(),
            boxShadow: `0 0 8px ${getStatusColor()}`,
          }}
        />
        <span style={{ color: '#cbd5e1', fontSize: '14px', fontWeight: '500' }}>
          {getStatusText()}
        </span>
      </div>

      {data && (
        <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: '#94a3b8' }}>Timestamp:</span>
            <div
              style={{
                color: '#cbd5e1',
                backgroundColor: '#1e293b',
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
              <span style={{ color: '#94a3b8' }}>Server IP:</span>
              <div
                style={{
                  color: '#cbd5e1',
                  backgroundColor: '#1e293b',
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
