import { useCallback, useEffect, useState } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

let toastCounter = 0;

/** Lightweight toast state — call `addToast()` from anywhere in the app. */
const listeners = new Set<(toast: Toast) => void>();

export function addToast(message: string, type: 'success' | 'error' = 'success') {
  const toast: Toast = { id: String(++toastCounter), message, type };
  listeners.forEach((fn) => fn(toast));
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (toast: Toast) => setToasts((prev) => [...prev, toast]);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, dismiss };
}
