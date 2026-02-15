import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { AuthProvider, initializeAuth } from './lib/auth/AuthContext';
import { TrpcProvider } from './lib/trpc/Provider';
import './styles/index.css';

// Refresh the auth token before React mounts so that AuthProvider can
// initialize synchronously — no async effects on mount, no Strict Mode issues.
void (async () => {
  await initializeAuth();

  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element #root not found in document');

  createRoot(rootElement).render(
    <React.StrictMode>
      <AuthProvider>
        <TrpcProvider>
          <App />
        </TrpcProvider>
      </AuthProvider>
    </React.StrictMode>
  );
})();
