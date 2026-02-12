import { DevPanel } from './components/dev/DevPanel';
import { Dashboard } from './pages/Dashboard';

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

function App() {
  return (
    <>
      {/* Dev Panel - only visible in dev mode */}
      <DevPanel />
      <Dashboard />
    </>
  );
}

export default App;
