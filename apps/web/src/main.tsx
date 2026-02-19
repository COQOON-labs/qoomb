import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import TypesafeI18n from './i18n/i18n-react';
import { loadAllLocales } from './i18n/i18n-util.sync';
import { AuthProvider } from './lib/auth/AuthContext';
import { TrpcProvider } from './lib/trpc/Provider';
import './styles/index.css';

// Load all locales synchronously at startup
loadAllLocales();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found in document');

createRoot(rootElement).render(
  <React.StrictMode>
    <TypesafeI18n locale="de">
      <AuthProvider>
        <TrpcProvider>
          <App />
        </TrpcProvider>
      </AuthProvider>
    </TypesafeI18n>
  </React.StrictMode>
);
