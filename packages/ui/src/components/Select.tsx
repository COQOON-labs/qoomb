import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../utils/cn';

const selectVariants = cva(
  'flex h-11 w-full appearance-none rounded-lg border bg-card pl-4 pr-10 py-2.5 text-sm transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 ' +
    'disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground disabled:border-border/40 cursor-pointer',
  {
    variants: {
      state: {
        default: 'border-border hover:border-muted-foreground',
        error: 'border-destructive hover:border-destructive focus-visible:ring-destructive',
      },
    },
    defaultVariants: { state: 'default' },
  }
);

function ChevronDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement>, VariantProps<typeof selectVariants> {
  /** Label for the select */
  label?: string;
  /** Error message to display */
  error?: string;
  /** Helper text below the select */
  helperText?: string;
}

/**
 * Select component with label and error handling.
 * Visually consistent with the Input component.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, id, children, disabled, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id ?? generatedId;

    return (
      <div className="w-full">
        {label && (
          <LabelPrimitive.Root
            htmlFor={selectId}
            className={cn(
              'mb-2 block text-sm font-medium text-foreground transition-colors',
              disabled && 'text-muted-foreground'
            )}
          >
            {label}
          </LabelPrimitive.Root>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(selectVariants({ state: error ? 'error' : 'default' }), className)}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={
              error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined
            }
            disabled={disabled}
            {...props}
          >
            {children}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-muted-foreground">
            <ChevronDownIcon />
          </div>
        </div>
        {error && (
          <p id={`${selectId}-error`} className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${selectId}-helper`} className="mt-2 text-sm text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
