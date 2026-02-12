export function EnvironmentInfo() {
  const origin = window.location.origin;
  const tRPCUrl = import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/trpc`
    : `${origin}/trpc`;

  const envVars = {
    'window.location.origin': origin,
    'tRPC URL': tRPCUrl,
    VITE_API_URL: import.meta.env.VITE_API_URL || '(not set - using origin)',
    NODE_ENV: import.meta.env.MODE,
    DEV: String(import.meta.env.DEV),
    PROD: String(import.meta.env.PROD),
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
        🌐 Environment Info
      </h3>

      <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
        {Object.entries(envVars).map(([key, value]) => (
          <div
            key={key}
            style={{
              marginBottom: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontWeight: '500' }}>{key}:</span>
            <span
              style={{
                color: 'rgba(255, 255, 255, 0.75)',
                backgroundColor: '#1A1A18',
                padding: '4px 8px',
                borderRadius: '4px',
                wordBreak: 'break-all',
              }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
