/**
 * Frontend-only visibility guard for list field operations.
 *
 * canDeleteField (domain rule, shared) is imported from @qoomb/types.
 * canToggleVisibility is view-state-dependent, so it lives here (frontend only).
 */
import type { FieldInfo, ViewInfo, GuardResult } from '@qoomb/types';

export type { FieldInfo, ViewInfo, GuardResult };
export { canDeleteField } from '@qoomb/types';

// ── Visibility guard (frontend only) ─────────────────────────────────────────

/**
 * Can this field's visibility be toggled in the given view?
 *
 * Rules:
 * 1. The checkbox field in a checklist view is always visible (locked).
 * 2. The last visible field (excl. locked fields) can't be hidden.
 */
export function canToggleVisibility(
  fieldId: string,
  isCurrentlyVisible: boolean,
  allFields: readonly FieldInfo[],
  visibleFieldIds: ReadonlySet<string>,
  activeView: ViewInfo | null
): GuardResult {
  // Showing a hidden field is always allowed
  if (!isCurrentlyVisible) {
    return { allowed: true };
  }

  // Rule 1: checkbox field locked in checklist view
  if (activeView?.viewType === 'checklist') {
    const cbId = (activeView.config as { checkboxFieldId?: string } | null)?.checkboxFieldId;
    if (cbId === fieldId) {
      return { allowed: false, reason: 'checkboxFieldLocked' };
    }
  }

  // Rule 2: last visible (non-locked) field
  const lockedIds = getLockedFieldIds(activeView);
  const toggleableVisible = [...visibleFieldIds].filter((id) => !lockedIds.has(id));
  if (toggleableVisible.length <= 1 && visibleFieldIds.has(fieldId) && !lockedIds.has(fieldId)) {
    return { allowed: false, reason: 'lastVisibleField' };
  }

  return { allowed: true };
}

// ── Helper ────────────────────────────────────────────────────────────────────

function getLockedFieldIds(activeView: ViewInfo | null): ReadonlySet<string> {
  const locked = new Set<string>();
  if (activeView?.viewType === 'checklist') {
    const cbId = (activeView.config as { checkboxFieldId?: string } | null)?.checkboxFieldId;
    if (cbId) locked.add(cbId);
  }
  return locked;
}
