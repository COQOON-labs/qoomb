/**
 * Domain utilities for list field operations.
 *
 * These are pure, framework-agnostic functions that encode list business rules.
 * They are shared between frontend (UI guards) and backend (API validation).
 *
 * @see ADR-0002 for the shared domain utilities pattern.
 */

// ── Shared guard types ────────────────────────────────────────────────────────

export interface FieldInfo {
  id: string;
  fieldType: string;
}

export interface ViewInfo {
  viewType: string;
  config: Record<string, unknown> | null;
}

export type GuardResult = { allowed: true } | { allowed: false; reason: string };

// ── Deletion guard ────────────────────────────────────────────────────────────

/**
 * Can this field be deleted from the list?
 *
 * Rules (enforced on both frontend and backend):
 * 1. The last remaining field can never be deleted.
 * 2. A field that is the active `checkboxFieldId` of a checklist view cannot be deleted.
 * 3. A field that is the active `groupByFieldId` of a kanban view cannot be deleted.
 * 4. A field that is the active `titleFieldId` of a checklist view cannot be deleted.
 *
 * Reason keys map to `LL.lists.settingsPanel.guards.*` on the frontend and to
 * a PRECONDITION_FAILED TRPCError message on the backend.
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

  for (const view of views) {
    if (view.viewType === 'checklist') {
      // Rule 2: active checkbox field in a checklist view
      const cbId = (view.config as { checkboxFieldId?: string } | null)?.checkboxFieldId;
      if (cbId === fieldId) {
        return { allowed: false, reason: 'activeCheckboxField' };
      }
      // Rule 4: active title field in a checklist view
      const titleId = (view.config as { titleFieldId?: string } | null)?.titleFieldId;
      if (titleId === fieldId) {
        return { allowed: false, reason: 'activeTitleField' };
      }
    }

    // Rule 3: active groupBy field in a kanban view
    if (view.viewType === 'kanban') {
      const gbId = (view.config as { groupByFieldId?: string } | null)?.groupByFieldId;
      if (gbId === fieldId) {
        return { allowed: false, reason: 'activeGroupByField' };
      }
    }
  }

  return { allowed: true };
}
