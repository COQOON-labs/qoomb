import { trpc } from './lib/trpc/client';

function App() {
  // Test the tRPC connection with the health check
  const healthQuery = trpc.health.useQuery();

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>🐝 Qoomb - Family Organization</h1>

      <div style={{ marginTop: '2rem' }}>
        <h2>Backend Connection Status</h2>
        {healthQuery.isLoading && <p>Loading...</p>}
        {healthQuery.error && <p style={{ color: 'red' }}>Error: {healthQuery.error.message}</p>}
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
  );
}

export default App;
