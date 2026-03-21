import { describe, it, expect } from 'vitest';

import { canToggleVisibility, type FieldInfo, type ViewInfo } from './listFieldGuards';

// ── Helpers ───────────────────────────────────────────────────────────────────

function field(id: string, fieldType = 'text'): FieldInfo {
  return { id, fieldType };
}

function tableView(config: Record<string, unknown> | null = null): ViewInfo {
  return { viewType: 'table', config };
}

function checklistView(checkboxFieldId: string): ViewInfo {
  return { viewType: 'checklist', config: { checkboxFieldId } };
}

function kanbanView(groupByFieldId: string): ViewInfo {
  return { viewType: 'kanban', config: { groupByFieldId } };
}

// ── canToggleVisibility ───────────────────────────────────────────────────────

describe('canToggleVisibility', () => {
  it('always allows showing a hidden field', () => {
    const fields = [field('f1'), field('f2')];
    const visible = new Set(['f1']);
    const result = canToggleVisibility('f2', false, fields, visible, tableView());
    expect(result).toEqual({ allowed: true });
  });

  it('allows hiding a field when others remain visible', () => {
    const fields = [field('f1'), field('f2'), field('f3')];
    const visible = new Set(['f1', 'f2', 'f3']);
    const result = canToggleVisibility('f2', true, fields, visible, tableView());
    expect(result).toEqual({ allowed: true });
  });

  it('blocks hiding the last visible field in a table view', () => {
    const fields = [field('f1'), field('f2')];
    const visible = new Set(['f1']);
    const result = canToggleVisibility('f1', true, fields, visible, tableView());
    expect(result).toEqual({ allowed: false, reason: 'lastVisibleField' });
  });

  it('blocks hiding the checkbox field in a checklist view', () => {
    const fields = [field('cb', 'checkbox'), field('f2')];
    const visible = new Set(['cb', 'f2']);
    const result = canToggleVisibility('cb', true, fields, visible, checklistView('cb'));
    expect(result).toEqual({ allowed: false, reason: 'checkboxFieldLocked' });
  });

  it('blocks hiding the last non-checkbox visible field in checklist view', () => {
    const fields = [field('cb', 'checkbox'), field('f2')];
    const visible = new Set(['cb', 'f2']);
    // cb is locked, f2 is the last toggleable field
    const result = canToggleVisibility('f2', true, fields, visible, checklistView('cb'));
    expect(result).toEqual({ allowed: false, reason: 'lastVisibleField' });
  });

  it('allows hiding a non-checkbox field when other non-locked fields remain visible', () => {
    const fields = [field('cb', 'checkbox'), field('f2'), field('f3')];
    const visible = new Set(['cb', 'f2', 'f3']);
    const result = canToggleVisibility('f2', true, fields, visible, checklistView('cb'));
    expect(result).toEqual({ allowed: true });
  });

  it('allows toggling with no active view', () => {
    const fields = [field('f1'), field('f2')];
    const visible = new Set(['f1', 'f2']);
    const result = canToggleVisibility('f1', true, fields, visible, null);
    expect(result).toEqual({ allowed: true });
  });

  it('handles kanban view with no special locking', () => {
    const fields = [field('sel', 'select'), field('f2'), field('f3')];
    const visible = new Set(['sel', 'f2', 'f3']);
    const result = canToggleVisibility('f2', true, fields, visible, kanbanView('sel'));
    expect(result).toEqual({ allowed: true });
  });

  it('blocks hiding last visible field in kanban view', () => {
    const fields = [field('sel', 'select'), field('f2')];
    const visible = new Set(['f2']);
    const result = canToggleVisibility('f2', true, fields, visible, kanbanView('sel'));
    expect(result).toEqual({ allowed: false, reason: 'lastVisibleField' });
  });
});
