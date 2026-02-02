import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { TrpcProvider } from './lib/trpc/Provider';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TrpcProvider>
      <App />
    </TrpcProvider>
  </React.StrictMode>
);
