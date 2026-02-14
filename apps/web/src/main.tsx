import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { AuthProvider } from './lib/auth/AuthContext';
import { TrpcProvider } from './lib/trpc/Provider';
import './styles/index.css';

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
