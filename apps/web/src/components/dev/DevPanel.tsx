import { useState } from 'react';

import { APP_VERSION } from '../../App';

import { DevPanelTab } from './DevPanelTab';
import { EnvironmentInfo } from './sections/EnvironmentInfo';
import { HealthCheck } from './sections/HealthCheck';
import { MobileSetup } from './sections/MobileSetup';
import { NetworkStatus } from './sections/NetworkStatus';
import { QuickActions } from './sections/QuickActions';

export function DevPanel() {
  const [isOpen, setIsOpen] = useState(false);

  // Only render in development mode
  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <>
      {/* Floating Tab Button */}
      <DevPanelTab onClick={() => setIsOpen(!isOpen)} isOpen={isOpen} />

      {/* Sliding Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: isOpen ? 0 : '-400px',
          width: '400px',
          height: '100vh',
          backgroundColor: '#111110',
          borderLeft: '2px solid #F5C400',
          boxShadow: isOpen ? '-4px 0 16px rgba(0, 0, 0, 0.5)' : 'none',
          transition: 'right 0.3s ease',
          zIndex: 9998,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px',
            borderBottom: '2px solid #F5C400',
            backgroundColor: '#1A1A18',
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          <h2
            style={{
              margin: 0,
              color: '#F5C400',
              fontSize: '18px',
              fontWeight: '900',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            🐝 Dev Tools
          </h2>
          <p
            style={{
              margin: '4px 0 0 0',
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Development mode only
          </p>
        </div>

        {/* Sections */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <MobileSetup />
          <EnvironmentInfo />
          <HealthCheck />
          <NetworkStatus />
          <QuickActions />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: '#1A1A18',
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.3)',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Qoomb v{APP_VERSION} · Dev Mode
        </div>
      </div>

      {/* Overlay when panel is open */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            zIndex: 9997,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}
    </>
  );
}
