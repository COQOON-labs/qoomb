import type * as React from 'react';

import { cn } from '../utils/cn';

export interface FormSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Section heading */
  title?: string;
  /** Short description below the title */
  description?: string;
  /**
   * Content rendered in the footer area (e.g. save button + status message).
   * Separated from the field area by extra top spacing.
   */
  footer?: React.ReactNode;
}

/**
 * Flat, integrated form section — no card background, no box shadow.
 * Sections are visually separated by spacing and a muted group-label heading.
 *
 * Usage:
 * ```tsx
 * <FormSection
 *   title="Profile"
 *   description="Manage your display name."
 *   footer={<Button fullWidth>Save</Button>}
 * >
 *   <Input label="Name" ... />
 * </FormSection>
 * ```
 */
export function FormSection({
  title,
  description,
  footer,
  children,
  className,
  ...props
}: FormSectionProps) {
  return (
    <div className={cn('flex flex-col gap-5', className)} {...props}>
      {(title || description) && (
        <div className="flex flex-col gap-1">
          {title && (
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {title}
            </h2>
          )}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}

      {children && <div className="flex flex-col gap-4">{children}</div>}

      {footer && <div className="flex flex-col gap-2">{footer}</div>}
    </div>
  );
}
