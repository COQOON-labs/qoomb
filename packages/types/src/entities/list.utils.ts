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
 * 2. A field that is the active checkbox field of a checklist view cannot be deleted.
 *    If `checkboxFieldId` is not set in config, the first checkbox field is implicit.
 * 3. A field that is the active `groupByFieldId` of a kanban view cannot be deleted.
 * 4. A field that is the active title field of a checklist view cannot be deleted.
 *    If `titleFieldId` is not set in config, the first text field is the implicit title.
 *    This mirrors the frontend fallback in `checklistConfig` / `ListDetailPage`.
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
      // Rule 2: active checkbox field in a checklist view.
      // Fall back to the first checkbox field when checkboxFieldId is not saved
      // (old views / null config) — same implicit selection as the frontend.
      const cbId = (view.config as { checkboxFieldId?: string } | null)?.checkboxFieldId;
      const effectiveCbId = cbId ?? allFields.find((f) => f.fieldType === 'checkbox')?.id;
      if (effectiveCbId === fieldId) {
        return { allowed: false, reason: 'activeCheckboxField' };
      }
      // Rule 4: active title field in a checklist view.
      // If titleFieldId is explicitly set, protect that field.
      // If not set (old view / null config), protect the first text field — same
      // fallback the frontend uses so the guard matches what the user sees.
      const titleId = (view.config as { titleFieldId?: string } | null)?.titleFieldId;
      const effectiveTitleId = titleId ?? allFields.find((f) => f.fieldType === 'text')?.id;
      if (effectiveTitleId === fieldId) {
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
