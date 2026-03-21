import { describe, it, expect } from 'vitest';

import { canDeleteField, type FieldInfo, type ViewInfo } from './list.utils';

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

  it('allows deleting a non-text field when checklist view has null config', () => {
    // f1 is text (implicit title, protected), f2 is number (not protected)
    const fields = [field('f1', 'text'), field('f2', 'number')];
    const views: ViewInfo[] = [{ viewType: 'checklist', config: null }];
    const result = canDeleteField('f2', fields, views);
    expect(result).toEqual({ allowed: true });
  });

  it('blocks deleting the active title field of a checklist view', () => {
    const fields = [field('t1', 'text'), field('cb', 'checkbox'), field('f3')];
    const views: ViewInfo[] = [
      { viewType: 'checklist', config: { checkboxFieldId: 'cb', titleFieldId: 't1' } },
    ];
    const result = canDeleteField('t1', fields, views);
    expect(result).toEqual({ allowed: false, reason: 'activeTitleField' });
  });

  it('allows deleting a text field not used as title', () => {
    const fields = [field('t1', 'text'), field('t2', 'text'), field('cb', 'checkbox')];
    const views: ViewInfo[] = [
      { viewType: 'checklist', config: { checkboxFieldId: 'cb', titleFieldId: 't1' } },
    ];
    const result = canDeleteField('t2', fields, views);
    expect(result).toEqual({ allowed: true });
  });

  it('blocks deleting the first text field when titleFieldId is not configured (fallback)', () => {
    // Simulates an old view where titleFieldId was never saved — the first text field
    // is the implicit title, the same fallback the frontend uses for display.
    const fields = [field('t1', 'text'), field('cb', 'checkbox'), field('f3')];
    const views: ViewInfo[] = [{ viewType: 'checklist', config: { checkboxFieldId: 'cb' } }];
    const result = canDeleteField('t1', fields, views);
    expect(result).toEqual({ allowed: false, reason: 'activeTitleField' });
  });

  it('blocks deleting the first text field when checklist config is null (fallback)', () => {
    const fields = [field('t1', 'text'), field('t2', 'text'), field('f3')];
    const views: ViewInfo[] = [{ viewType: 'checklist', config: null }];
    const result = canDeleteField('t1', fields, views);
    expect(result).toEqual({ allowed: false, reason: 'activeTitleField' });
  });

  it('allows deleting a non-first text field when titleFieldId is not configured', () => {
    const fields = [field('t1', 'text'), field('t2', 'text'), field('cb', 'checkbox')];
    const views: ViewInfo[] = [{ viewType: 'checklist', config: { checkboxFieldId: 'cb' } }];
    const result = canDeleteField('t2', fields, views);
    expect(result).toEqual({ allowed: true });
  });
});
