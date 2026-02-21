import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { baseLocale } from './i18n/i18n-util';
import { loadLocale } from './i18n/i18n-util.sync';
import { AuthProvider } from './lib/auth/AuthContext';
import { LocaleProvider } from './lib/locale/LocaleProvider';
import { TrpcProvider } from './lib/trpc/Provider';
import './styles/index.css';

// Only preload the base locale synchronously.
// All other locales are loaded on demand by LocaleProvider.
loadLocale(baseLocale);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found in document');

createRoot(rootElement).render(
  <React.StrictMode>
    <LocaleProvider>
      <AuthProvider>
        <TrpcProvider>
          <App />
        </TrpcProvider>
      </AuthProvider>
    </LocaleProvider>
  </React.StrictMode>
);
