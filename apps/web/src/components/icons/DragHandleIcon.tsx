import type { IconProps } from './types';

export function DragHandleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="7" cy="5" r="1.2" />
      <circle cx="7" cy="10" r="1.2" />
      <circle cx="7" cy="15" r="1.2" />
      <circle cx="13" cy="5" r="1.2" />
      <circle cx="13" cy="10" r="1.2" />
      <circle cx="13" cy="15" r="1.2" />
    </svg>
  );
}
