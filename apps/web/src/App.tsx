import { DevPanel } from './components/dev/DevPanel';
import { trpc } from './lib/trpc/client';

/**
 * Application Version
 *
 * IMPORTANT: Only change this for actual releases, not for incremental development!
 * See claude.md "Versioning Policy" section for when to bump versions.
 *
 * Current: 0.1.0 (Phase 1 - Foundation)
 * Next: 0.2.0 (Phase 2 - Auth + Core Features)
 */
export const APP_VERSION = '0.1.0';

// Debug: Unregister any existing service workers (dev only)
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void (async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  })();
}

function Footer() {
  return (
    <footer
      style={{
        marginTop: '4rem',
        padding: '1rem 2rem',
        borderTop: '1px solid #e5e7eb',
        fontSize: '0.875rem',
        color: '#6b7280',
        backgroundColor: '#f9fafb',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
        <strong>Qoomb</strong> v{APP_VERSION} • Privacy-First Hive Organization
      </div>
    </footer>
  );
}

function App() {
  // Test the tRPC connection with the health check
  const healthQuery = trpc.health.useQuery();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Dev Panel - only visible in dev mode */}
      <DevPanel />

      <div style={{ flex: 1, padding: '2rem', fontFamily: 'system-ui' }}>
        <h1>🐝 Qoomb - Family Organization</h1>

        <div style={{ marginTop: '2rem' }}>
          <h2>Backend Connection Status</h2>
          {healthQuery.isLoading && <p>Loading...</p>}
          {healthQuery.error && (
            <div>
              <p style={{ color: 'red' }}>Error: {healthQuery.error.message}</p>
              <details style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                <summary>Error Details</summary>
                <pre
                  style={{
                    backgroundColor: '#fee',
                    padding: '1rem',
                    borderRadius: '0.25rem',
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(healthQuery.error, null, 2)}
                </pre>
              </details>
            </div>
          )}
          {healthQuery.data && (
            <div>
              <p style={{ color: 'green' }}>✅ Connected to backend!</p>
              <p>Status: {healthQuery.data.status}</p>
              <p>Timestamp: {healthQuery.data.timestamp}</p>
            </div>
          )}
        </div>

        <div style={{ marginTop: '2rem' }}>
          <h2>Phase 1: Foundation Complete</h2>
          <ul>
            <li>✅ Monorepo structure</li>
            <li>✅ NestJS backend with tRPC</li>
            <li>✅ React frontend with Vite</li>
            <li>✅ Shared TypeScript types</li>
            <li>✅ Docker Compose (PostgreSQL + Redis)</li>
          </ul>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <h2>Next Steps</h2>
          <ul>
            <li>
              Install dependencies: <code>pnpm install</code>
            </li>
            <li>
              Start services: <code>docker-compose up -d</code>
            </li>
            <li>
              Run migrations: <code>pnpm --filter @qoomb/api db:migrate</code>
            </li>
            <li>
              Start dev servers: <code>pnpm dev</code>
            </li>
          </ul>
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default App;
