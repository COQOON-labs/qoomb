import { describe, it, expect } from 'vitest';

import {
  canDeleteField,
  canToggleVisibility,
  type FieldInfo,
  type ViewInfo,
} from './listFieldGuards';

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

// ── canDeleteField ────────────────────────────────────────────────────────────

describe('canDeleteField', () => {
  it('allows deleting a regular field with multiple fields', () => {
    const fields = [field('f1'), field('f2'), field('f3')];
    const result = canDeleteField('f2', fields, [tableView()]);
    expect(result).toEqual({ allowed: true });
  });

  it('blocks deleting the last remaining field', () => {
    const fields = [field('f1')];
    const result = canDeleteField('f1', fields, [tableView()]);
    expect(result).toEqual({ allowed: false, reason: 'lastField' });
  });

  it('blocks deleting the active checkbox field of a checklist view', () => {
    const fields = [field('cb', 'checkbox'), field('f2')];
    const views = [checklistView('cb')];
    const result = canDeleteField('cb', fields, views);
    expect(result).toEqual({ allowed: false, reason: 'activeCheckboxField' });
  });

  it('allows deleting a checkbox field not used by any view', () => {
    const fields = [field('cb1', 'checkbox'), field('cb2', 'checkbox'), field('f3')];
    const views = [checklistView('cb1')];
    const result = canDeleteField('cb2', fields, views);
    expect(result).toEqual({ allowed: true });
  });

  it('blocks deleting the active groupBy field of a kanban view', () => {
    const fields = [field('sel', 'select'), field('f2')];
    const views = [kanbanView('sel')];
    const result = canDeleteField('sel', fields, views);
    expect(result).toEqual({ allowed: false, reason: 'activeGroupByField' });
  });

  it('allows deleting a select field not used by any kanban view', () => {
    const fields = [field('s1', 'select'), field('s2', 'select'), field('f3')];
    const views = [kanbanView('s1')];
    const result = canDeleteField('s2', fields, views);
    expect(result).toEqual({ allowed: true });
  });

  it('blocks if field is referenced by multiple view types', () => {
    const fields = [field('cb', 'checkbox'), field('f2')];
    const views = [checklistView('cb'), tableView()];
    const result = canDeleteField('cb', fields, views);
    expect(result).toEqual({ allowed: false, reason: 'activeCheckboxField' });
  });

  it('allows deletion with two fields and no view dependency', () => {
    const fields = [field('f1'), field('f2')];
    const result = canDeleteField('f1', fields, [tableView()]);
    expect(result).toEqual({ allowed: true });
  });

  it('handles empty views array', () => {
    const fields = [field('f1'), field('f2')];
    const result = canDeleteField('f1', fields, []);
    expect(result).toEqual({ allowed: true });
  });

  it('handles view with null config', () => {
    const fields = [field('f1'), field('f2')];
    const views: ViewInfo[] = [{ viewType: 'checklist', config: null }];
    const result = canDeleteField('f1', fields, views);
    expect(result).toEqual({ allowed: true });
  });
});

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
