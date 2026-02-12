import { useCallback, useSyncExternalStore } from 'react';

/**
 * Hook to detect if the app is online/offline
 * Useful for offline-first features
 */
export function useOnlineStatus(): boolean {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
      window.removeEventListener('online', callback);
      window.removeEventListener('offline', callback);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    return navigator.onLine;
  }, []);

  const getServerSnapshot = useCallback(() => {
    // On server, assume online
    return true;
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
