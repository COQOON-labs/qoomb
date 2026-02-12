import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { TrpcProvider } from './lib/trpc/Provider';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found in document');

createRoot(rootElement).render(
  <React.StrictMode>
    <TrpcProvider>
      <App />
    </TrpcProvider>
  </React.StrictMode>
);
