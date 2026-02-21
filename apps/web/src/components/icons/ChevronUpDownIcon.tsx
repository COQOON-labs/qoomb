import { cn } from '@qoomb/ui';

import type { IconProps } from './types';

export function ChevronUpDownIcon({ className }: IconProps) {
  return (
    <svg
      className={cn('w-3.5 h-3.5', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
    </svg>
  );
}
