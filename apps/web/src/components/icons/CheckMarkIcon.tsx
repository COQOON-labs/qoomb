import { cn } from '@qoomb/ui';

import type { IconProps } from './types';

export function CheckMarkIcon({ className }: IconProps) {
  return (
    <svg
      className={cn('w-2.5 h-2.5', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
