import { getDevEnvironment } from '../devEnvironment';

export function EnvironmentInfo() {
  const { origin, trpcUrl } = getDevEnvironment();

  const envVars = {
    'window.location.origin': origin,
    'tRPC URL': trpcUrl,
    VITE_API_URL: import.meta.env.VITE_API_URL || '(not set - using origin)',
    NODE_ENV: import.meta.env.MODE,
    DEV: String(import.meta.env.DEV),
    PROD: String(import.meta.env.PROD),
  };

  return (
    <div className="p-4 border-b border-white/8">
      <h3 className="text-primary text-sm font-black mb-3 uppercase tracking-widest">
        🌐 Environment Info
      </h3>

      <div className="text-xs font-mono">
        {Object.entries(envVars).map(([key, value]) => (
          <div key={key} className="mb-2 flex flex-col gap-1">
            <span className="text-white/40 font-medium">{key}:</span>
            <span className="text-white/75 bg-dev-surface px-2 py-1 rounded break-all">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
