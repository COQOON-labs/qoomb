/**
 * Pure guard functions for list field operations (delete, visibility toggle).
 *
 * Every guard returns `{ allowed: true }` or `{ allowed: false, reason: string }`.
 * The reason key is an i18n key suffix consumers can resolve via `LL.lists.guards.*()`.
 *
 * All functions are framework-agnostic — no React, no tRPC, no side-effects.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FieldInfo {
  id: string;
  fieldType: string;
}

export interface ViewInfo {
  viewType: string;
  config: Record<string, unknown> | null;
}

export type GuardResult = { allowed: true } | { allowed: false; reason: string };

// ── Deletion guards ───────────────────────────────────────────────────────────

/**
 * Can this field be deleted from the list?
 *
 * Rules:
 * 1. The last remaining field can never be deleted.
 * 2. A field that is the active checkboxFieldId of a checklist view can't be deleted.
 * 3. A field that is the active groupByFieldId of a kanban view can't be deleted.
 */
export function canDeleteField(
  fieldId: string,
  allFields: readonly FieldInfo[],
  views: readonly ViewInfo[]
): GuardResult {
  // Rule 1: last field
  if (allFields.length <= 1) {
    return { allowed: false, reason: 'lastField' };
  }

  // Rule 2: active checkbox field in a checklist view
  for (const view of views) {
    if (view.viewType === 'checklist') {
      const cbId = (view.config as { checkboxFieldId?: string } | null)?.checkboxFieldId;
      if (cbId === fieldId) {
        return { allowed: false, reason: 'activeCheckboxField' };
      }
    }
  }

  // Rule 3: active groupBy field in a kanban view
  for (const view of views) {
    if (view.viewType === 'kanban') {
      const gbId = (view.config as { groupByFieldId?: string } | null)?.groupByFieldId;
      if (gbId === fieldId) {
        return { allowed: false, reason: 'activeGroupByField' };
      }
    }
  }

  return { allowed: true };
}

// ── Visibility guards ─────────────────────────────────────────────────────────

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
  const lockedIds = getLockedFieldIds(allFields, activeView);
  const toggleableVisible = [...visibleFieldIds].filter((id) => !lockedIds.has(id));
  if (toggleableVisible.length <= 1 && visibleFieldIds.has(fieldId) && !lockedIds.has(fieldId)) {
    return { allowed: false, reason: 'lastVisibleField' };
  }

  return { allowed: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the set of field IDs that are "locked visible" in the given view
 * (e.g. the checkbox field in a checklist view).
 */
function getLockedFieldIds(
  _allFields: readonly FieldInfo[],
  activeView: ViewInfo | null
): ReadonlySet<string> {
  const locked = new Set<string>();
  if (activeView?.viewType === 'checklist') {
    const cbId = (activeView.config as { checkboxFieldId?: string } | null)?.checkboxFieldId;
    if (cbId) locked.add(cbId);
  }
  return locked;
}
