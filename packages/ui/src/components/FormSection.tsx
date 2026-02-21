import type * as React from 'react';

import { cn } from '../utils/cn';

import { Card } from './Card';

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
 * A Card-based form section with a clear visual hierarchy:
 * header (title + description) → fields → footer (action + feedback).
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
    <Card padding="lg" className={cn('flex flex-col gap-6', className)} {...props}>
      {(title || description) && (
        <div className={cn('flex flex-col gap-1', children && 'pb-6 border-b border-border')}>
          {title && (
            <h2 className="text-base font-semibold text-foreground leading-snug">{title}</h2>
          )}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}

      {children && <div className="flex flex-col gap-5">{children}</div>}

      {footer && <div className="flex flex-col gap-2 pt-2">{footer}</div>}
    </Card>
  );
}
