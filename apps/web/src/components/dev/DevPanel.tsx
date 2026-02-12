import { cn } from '@qoomb/ui';
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
        className={cn(
          'fixed top-0 h-screen w-100 bg-dev-bg border-l-2 border-primary',
          'flex flex-col overflow-y-auto z-9998',
          'transition-[right] duration-300 ease-in-out',
          isOpen ? 'right-0 shadow-[-4px_0_16px_rgba(0,0,0,0.5)]' : '-right-100 shadow-none'
        )}
      >
        {/* Header */}
        <div className="p-4 border-b-2 border-primary bg-dev-surface sticky top-0 z-1">
          <h2 className="m-0 text-primary text-lg font-black flex items-center gap-2 tracking-wider uppercase">
            🐝 Dev Tools
          </h2>
          <p className="mt-1 text-white/40 text-xs uppercase tracking-widest">
            Development mode only
          </p>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto">
          <MobileSetup />
          <EnvironmentInfo />
          <HealthCheck />
          <NetworkStatus />
          <QuickActions />
        </div>

        {/* Footer */}
        <div className="py-3 px-4 border-t border-white/8 bg-dev-surface text-xs text-white/30 text-center uppercase tracking-widest">
          Qoomb v{APP_VERSION} · Dev Mode
        </div>
      </div>

      {/* Overlay when panel is open */}
      {isOpen && (
        <div onClick={() => setIsOpen(false)} className="fixed inset-0 bg-black/30 z-9997" />
      )}
    </>
  );
}
