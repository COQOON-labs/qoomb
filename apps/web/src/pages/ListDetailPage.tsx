import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button, Card, ConfirmDialog } from '@qoomb/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ArrowLeftIcon, PencilIcon, PlusIcon, SettingsIcon } from '../components/icons';
import { AddFieldForm } from '../components/lists/AddFieldForm';
import { AddViewPanel } from '../components/lists/AddViewPanel';
import { KanbanColumn } from '../components/lists/KanbanColumn';
import { ListSettingsPanel } from '../components/lists/ListSettingsPanel';
import { parsePersonValues } from '../components/lists/personField.utils';
import { SortableChecklistItem } from '../components/lists/SortableChecklistItem';
import { SortableColumnHeader } from '../components/lists/SortableColumnHeader';
import { SortableTableRow } from '../components/lists/SortableTableRow';
import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';
import { useAuth } from '../lib/auth/useAuth';
import { addToast } from '../lib/toast';
import { trpc } from '../lib/trpc/client';

// ── Icon picker options ───────────────────────────────────────────────────────

const ICON_OPTIONS = [
  '📋',
  '✅',
  '🛒',
  '📝',
  '📅',
  '🎯',
  '💡',
  '📚',
  '🏠',
  '💰',
  '🍽️',
  '🏋️',
  '🎵',
  '✈️',
  '🎁',
  '⭐',
];

// ── ListDetailPage ────────────────────────────────────────────────────────────

export function ListDetailPage() {
  const { LL, locale } = useI18nContext();
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: list, isLoading: listLoading } = trpc.lists.get.useQuery(id ?? '', {
    enabled: !!user && !!id,
  });

  const { data: items = [], isLoading: itemsLoading } = trpc.lists.listItems.useQuery(
    { listId: id ?? '' },
    { enabled: !!user && !!id }
  );

  const { data: persons = [] } = trpc.persons.list.useQuery(undefined, {
    enabled: !!user,
  });

  const personNameById = useMemo(
    () => new Map(persons.map((p) => [p.id, p.displayName ?? p.id])),
    [persons]
  );

  const isLoading = listLoading || itemsLoading;

  // Build a map: fieldId → field for quick lookup
  const fieldMap = useMemo(() => {
    if (!list) return new Map<string, NonNullable<typeof list>['fields'][number]>();
    return new Map(list.fields.map((f) => [f.id, f]));
  }, [list]);

  // ── Add field ─────────────────────────────────────────────────────────────
  const [showAddField, setShowAddField] = useState(false);

  // ── Add item ──────────────────────────────────────────────────────────────
  const [newItemValues, setNewItemValues] = useState<Record<string, string>>({});

  const createItem = trpc.lists.createItem.useMutation({
    onSuccess: () => {
      void utils.lists.listItems.invalidate({ listId: id ?? '' });
      setNewItemValues({});
    },
    onError: () => {
      addToast(LL.lists.createError(), 'error');
    },
  });

  const handleAddItem = useCallback(() => {
    if (!id || !list) return;
    const values: Record<string, string | number | boolean | null> = {};
    for (const [fieldId, raw] of Object.entries(newItemValues)) {
      if (!raw.trim()) continue;
      const field = fieldMap.get(fieldId);
      if (!field) continue;
      switch (field.fieldType) {
        case 'number':
          values[fieldId] = parseFloat(raw) || 0;
          break;
        case 'checkbox':
          values[fieldId] = raw === 'true';
          break;
        default:
          values[fieldId] = raw;
      }
    }
    if (Object.keys(values).length === 0) return;
    createItem.mutate({ listId: id, values });
  }, [id, list, newItemValues, fieldMap, createItem]);

  // ── Delete item ───────────────────────────────────────────────────────────
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);

  const deleteItem = trpc.lists.deleteItem.useMutation({
    onSuccess: () => {
      void utils.lists.listItems.invalidate({ listId: id ?? '' });
    },
    onError: () => {
      addToast(LL.lists.deleteError(), 'error');
    },
  });

  const handleDeleteItem = useCallback((itemId: string) => {
    setConfirmDeleteItemId(itemId);
  }, []);

  const handleConfirmDeleteItem = useCallback(() => {
    if (!confirmDeleteItemId) return;
    deleteItem.mutate(confirmDeleteItemId);
    setConfirmDeleteItemId(null);
  }, [confirmDeleteItemId, deleteItem]);

  // ── Rename list ───────────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const updateList = trpc.lists.update.useMutation({
    onSuccess: () => {
      void utils.lists.get.invalidate(id);
      void utils.lists.list.invalidate();
      setEditingName(false);
      addToast(LL.lists.updateSuccess());
    },
    onError: () => {
      addToast(LL.lists.updateError(), 'error');
    },
  });

  const handleStartEditName = useCallback(() => {
    if (!list || list.systemKey) return;
    setDraftName(list.name);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }, [list]);

  const handleSaveName = useCallback(() => {
    const trimmed = draftName.trim();
    if (!trimmed || !id || trimmed === list?.name) {
      setEditingName(false);
      return;
    }
    updateList.mutate({ id, data: { name: trimmed } });
  }, [draftName, id, list?.name, updateList]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSaveName();
      if (e.key === 'Escape') setEditingName(false);
    },
    [handleSaveName]
  );

  // ── Icon picker ───────────────────────────────────────────────────────────
  const [showIconPicker, setShowIconPicker] = useState(false);

  const handleIconSelect = useCallback(
    (icon: string) => {
      if (!id) return;
      updateList.mutate({ id, data: { icon } });
      setShowIconPicker(false);
    },
    [id, updateList]
  );

  // ── Archive toggle ────────────────────────────────────────────────────────
  const handleToggleArchive = useCallback(() => {
    if (!id || !list) return;
    updateList.mutate({ id, data: { isArchived: !list.isArchived } });
  }, [id, list, updateList]);

  // ── Remove field ──────────────────────────────────────────────────────────
  const [confirmDeleteFieldId, setConfirmDeleteFieldId] = useState<string | null>(null);

  const createField = trpc.lists.createField.useMutation({
    onSuccess: () => {
      void utils.lists.get.invalidate(id);
    },
    onError: () => {
      addToast(LL.lists.createError(), 'error');
    },
  });

  const handleAddCheckboxField = useCallback(() => {
    if (!id) return;
    createField.mutate({
      listId: id,
      name: LL.lists.checkboxFieldDefaultName(),
      fieldType: 'checkbox',
    });
  }, [id, LL, createField]);

  const deleteField = trpc.lists.deleteField.useMutation({
    onSuccess: () => {
      void utils.lists.get.invalidate(id);
      void utils.lists.listItems.invalidate({ listId: id ?? '' });
    },
    onError: () => {
      addToast(LL.lists.deleteError(), 'error');
    },
  });

  const handleConfirmDeleteField = useCallback(() => {
    if (!confirmDeleteFieldId || !id) return;
    deleteField.mutate({ id: confirmDeleteFieldId, listId: id });
    setConfirmDeleteFieldId(null);
  }, [confirmDeleteFieldId, id, deleteField]);

  // ── Settings panel ────────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);

  // Listen for field deletion events from the settings panel
  useEffect(() => {
    const handler = (e: Event) => {
      const fieldId = (e as CustomEvent<{ fieldId: string }>).detail.fieldId;
      setConfirmDeleteFieldId(fieldId);
    };
    window.addEventListener('list-settings:delete-field', handler);
    return () => window.removeEventListener('list-settings:delete-field', handler);
  }, []);

  // ── Views ─────────────────────────────────────────────────────────────────
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showAddView, setShowAddView] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [kanbanDragItemId, setKanbanDragItemId] = useState<string | null>(null);

  // ── Drag & drop reorder (items) ─────────────────────────────────────────
  const [localItemOrder, setLocalItemOrder] = useState<string[] | null>(null);

  const reorderItems = trpc.lists.reorderItems.useMutation({
    onError: () => {
      addToast(LL.lists.updateError(), 'error');
      setLocalItemOrder(null);
    },
  });

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !id) return;

      setLocalItemOrder((prev) => {
        const base = prev ?? items.map((i) => i.id);
        const oldIdx = base.indexOf(String(active.id));
        const newIdx = base.indexOf(String(over.id));
        if (oldIdx === -1 || newIdx === -1) return prev;
        const next = arrayMove(base, oldIdx, newIdx);
        reorderItems.mutate({
          listId: id,
          items: next.map((itemId, idx) => ({ id: itemId, sortOrder: idx })),
        });
        return next;
      });
    },
    [id, items, reorderItems]
  );

  // ── Drag & drop reorder (fields / columns) ────────────────────────────────
  const [localFieldOrder, setLocalFieldOrder] = useState<string[] | null>(null);

  const reorderFields = trpc.lists.reorderFields.useMutation({
    onSuccess: () => {
      setLocalFieldOrder(null);
      void utils.lists.get.invalidate(id);
    },
    onError: () => {
      addToast(LL.lists.updateError(), 'error');
      setLocalFieldOrder(null);
    },
  });

  const fieldDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const sortedFields = useMemo(() => {
    if (!list) return [];
    if (!localFieldOrder) return list.fields;
    return localFieldOrder
      .map((fid) => list.fields.find((f) => f.id === fid))
      .filter(Boolean) as typeof list.fields;
  }, [list, localFieldOrder]);

  const handleFieldDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !id || !list) return;

      const fieldIds = localFieldOrder ?? list.fields.map((f) => f.id);
      const oldIdx = fieldIds.indexOf(String(active.id));
      const newIdx = fieldIds.indexOf(String(over.id));
      if (oldIdx === -1 || newIdx === -1) return;

      const next = arrayMove(fieldIds, oldIdx, newIdx);
      setLocalFieldOrder(next);
      reorderFields.mutate({
        listId: id,
        fields: next.map((fieldId, idx) => ({ id: fieldId, sortOrder: idx })),
      });
    },
    [id, list, localFieldOrder, reorderFields]
  );

  // ── Inline cell editing ───────────────────────────────────────────────────
  const [editingCell, setEditingCell] = useState<{ itemId: string; fieldId: string } | null>(null);
  const [cellDraft, setCellDraft] = useState('');
  const cellInputRef = useRef<HTMLInputElement>(null);

  const updateItem = trpc.lists.updateItem.useMutation({
    onSuccess: () => {
      void utils.lists.listItems.invalidate({ listId: id ?? '' });
      setEditingCell(null);
    },
    onError: () => {
      addToast(LL.lists.updateError(), 'error');
    },
  });

  // ── Kanban drag handlers ──────────────────────────────────────────────────
  const handleKanbanDragStart = useCallback((itemId: string) => {
    setKanbanDragItemId(itemId);
  }, []);

  const handleKanbanDragEnd = useCallback(
    (event: DragEndEvent, groupByFieldId: string) => {
      setKanbanDragItemId(null);
      const { active, over } = event;
      if (!over || !id) return;
      const newValue = over.id === '__kanban_none__' ? null : String(over.id);
      updateItem.mutate({
        id: String(active.id),
        data: { values: { [groupByFieldId]: newValue } },
      });
    },
    [id, updateItem]
  );

  const handleCellClick = useCallback(
    (itemId: string, fieldId: string, fieldType: string, currentValue: string) => {
      if (fieldType === 'checkbox') {
        const newVal = currentValue !== '✓';
        updateItem.mutate({ id: itemId, data: { values: { [fieldId]: newVal } } });
        return;
      }
      // For person fields, currentValue is already the raw UUID (passed from SortableTableRow)
      // For other fields it is the display value
      setEditingCell({ itemId, fieldId });
      setCellDraft(currentValue);
      setTimeout(() => cellInputRef.current?.focus(), 0);
    },
    [updateItem]
  );

  const handleCellSave = useCallback(() => {
    if (!editingCell) return;
    const { itemId, fieldId } = editingCell;
    const field = fieldMap.get(fieldId);
    if (!field) {
      setEditingCell(null);
      return;
    }

    let value: string | number | boolean | null;
    const raw = cellDraft.trim();
    switch (field.fieldType) {
      case 'number':
        value = raw === '' ? null : parseFloat(raw) || 0;
        break;
      case 'checkbox':
        value = raw === 'true';
        break;
      default:
        value = raw === '' ? null : raw;
    }

    updateItem.mutate({ id: itemId, data: { values: { [fieldId]: value } } });
  }, [editingCell, cellDraft, fieldMap, updateItem]);

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleCellSave();
      if (e.key === 'Escape') setEditingCell(null);
    },
    [handleCellSave]
  );

  // ── Render helpers ────────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    void navigate('/lists');
  }, [navigate]);

  const getItemValue = useCallback(
    (item: (typeof items)[0], fieldId: string, fieldType: string): string => {
      const val = item.values.find((v) => v.fieldId === fieldId);
      if (!val || val.value === null || val.value === undefined) return '';
      switch (fieldType) {
        case 'checkbox':
          return val.value === 'true' ? '✓' : '✗';
        case 'date':
          return new Date(val.value).toLocaleDateString(locale);
        case 'person': {
          const vals = parsePersonValues(val.value);
          return vals.map((v) => personNameById.get(v) ?? v).join(', ');
        }
        default:
          return val.value;
      }
    },
    [locale, personNameById]
  );

  // ── View-derived computations ─────────────────────────────────────────────
  const activeView = useMemo(
    () => list?.views.find((v) => v.id === activeViewId) ?? list?.views[0] ?? null,
    [list, activeViewId]
  );

  const visibleFields = useMemo(() => {
    const cfg = activeView?.config as { visibleFieldIds?: string[] } | null;
    if (!cfg?.visibleFieldIds) return sortedFields;
    const visible = new Set(cfg.visibleFieldIds);
    return sortedFields.filter((f) => visible.has(f.id));
  }, [sortedFields, activeView]);

  const checkboxField = useMemo(
    () => list?.fields.find((f) => f.fieldType === 'checkbox') ?? null,
    [list]
  );

  const titleField = useMemo(
    () => list?.fields.find((f) => f.fieldType === 'text') ?? null,
    [list]
  );

  const sortedItems = useMemo(() => {
    if (localItemOrder) {
      const byId = new Map(items.map((i) => [i.id, i]));
      const ordered = localItemOrder
        .map((itemId) => byId.get(itemId))
        .filter(Boolean) as typeof items;
      // Append items added after the last drag (not yet in localItemOrder)
      const orderedIds = new Set(localItemOrder);
      const newItems = items.filter((i) => !orderedIds.has(i.id));
      return [...ordered, ...newItems];
    }
    return items;
  }, [items, localItemOrder]);

  const visibleItems = useMemo(() => {
    if (hideDone && activeView?.viewType === 'checklist' && checkboxField) {
      return sortedItems.filter(
        (item) => item.values.find((v) => v.fieldId === checkboxField.id)?.value !== 'true'
      );
    }
    return sortedItems;
  }, [sortedItems, hideDone, activeView, checkboxField]);

  // ── Not found / loading ───────────────────────────────────────────────────
  if (!id) return null;

  return (
    <AppShell>
      <div className="px-4 md:px-8 pt-6 pb-10 max-w-5xl">
        {/* ── Back + Header ────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          {LL.lists.backToLists()}
        </button>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{LL.common.loading()}</p>
        ) : !list ? (
          <p className="text-sm text-muted-foreground">{LL.lists.notFound()}</p>
        ) : (
          <>
            {/* ── List name ──────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 mb-4">
              {/* Icon — click to change */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowIconPicker((p) => !p)}
                  className="text-2xl leading-none hover:scale-110 transition-transform"
                  aria-label={LL.lists.editIcon()}
                >
                  {list.icon ?? '📋'}
                </button>
                {showIconPicker && (
                  <div className="absolute top-full left-0 mt-1 z-10 bg-background border border-border rounded-lg shadow-lg p-2 grid grid-cols-8 gap-1">
                    {ICON_OPTIONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => handleIconSelect(icon)}
                        className="w-8 h-8 flex items-center justify-center rounded hover:bg-muted transition-colors text-lg"
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Name — click to edit */}
              {editingName ? (
                <input
                  ref={nameInputRef}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={handleNameKeyDown}
                  className="text-2xl font-black text-foreground tracking-tight bg-transparent border-b-2 border-primary outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={handleStartEditName}
                  className="flex items-center gap-2 group"
                  disabled={!!list.systemKey}
                >
                  <h1 className="text-2xl font-black text-foreground tracking-tight">
                    {list.name}
                  </h1>
                  {!list.systemKey && (
                    <PencilIcon className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              )}

              {/* Archive toggle */}
              {!list.systemKey && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-muted-foreground"
                  onClick={handleToggleArchive}
                >
                  {list.isArchived ? LL.lists.unarchive() : LL.lists.archive()}
                </Button>
              )}
            </div>

            {/* Archived notice */}
            {list.isArchived && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                {LL.lists.archivedNotice()}
              </div>
            )}

            {/* ── View tab bar ───────────────────────────────────────────── */}
            {list.views.length > 0 && (
              <div className="flex items-center gap-1 mb-4 border-b border-border overflow-x-auto">
                {list.views.map((view) => {
                  const isActive = view.id === (activeView?.id ?? null);
                  return (
                    <button
                      key={view.id}
                      type="button"
                      onClick={() => setActiveViewId(view.id)}
                      className={
                        'px-3 py-1.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ' +
                        (isActive
                          ? 'border-primary text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground')
                      }
                    >
                      {view.viewType === 'checklist'
                        ? '✓ '
                        : view.viewType === 'kanban'
                          ? '⬜ '
                          : '⊞ '}
                      {view.name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setShowAddView((p) => !p)}
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent -mb-px transition-colors flex items-center gap-1"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  {LL.lists.addView()}
                </button>
                <div className="ml-auto flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowSettings((p) => !p)}
                    className={
                      'px-3 py-1.5 text-sm border-b-2 -mb-px transition-colors flex items-center gap-1 ' +
                      (showSettings
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground')
                    }
                    aria-label={LL.lists.settings()}
                  >
                    <SettingsIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
            {list.views.length === 0 && (
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={() => setShowAddView((p) => !p)}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  {LL.lists.addView()}
                </button>
              </div>
            )}

            {/* ── No fields state ────────────────────────────────────────── */}
            {list.fields.length === 0 && !showAddField ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <p className="text-sm text-muted-foreground">{LL.lists.noFields()}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowAddField(true)}
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  {LL.lists.addField()}
                </Button>
              </div>
            ) : (
              <>
                {/* ── Table view ────────────────────────────────────────── */}
                {activeView?.viewType !== 'checklist' && activeView?.viewType !== 'kanban' && (
                  <DndContext
                    sensors={dndSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <DndContext
                      sensors={fieldDndSensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleFieldDragEnd}
                    >
                      <Card padding="none" className="overflow-x-auto mb-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/30">
                              <th className="w-8 px-1" aria-hidden="true" />
                              <SortableContext
                                items={visibleFields.map((f) => f.id)}
                                strategy={horizontalListSortingStrategy}
                              >
                                {visibleFields.map((field) => (
                                  <SortableColumnHeader key={field.id} field={field} />
                                ))}
                              </SortableContext>
                              <th className="w-10 px-1">
                                <span className="sr-only">{LL.common.remove()}</span>
                              </th>
                            </tr>
                          </thead>
                          <SortableContext
                            items={sortedItems.map((i) => i.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <tbody>
                              {sortedItems.map((item) => (
                                <SortableTableRow
                                  key={item.id}
                                  item={item}
                                  fields={visibleFields}
                                  editingCell={editingCell}
                                  cellDraft={cellDraft}
                                  cellInputRef={cellInputRef}
                                  getItemValue={getItemValue}
                                  handleCellClick={handleCellClick}
                                  handleCellSave={handleCellSave}
                                  handleCellKeyDown={handleCellKeyDown}
                                  handleDeleteItem={handleDeleteItem}
                                  setCellDraft={setCellDraft}
                                  updateItem={updateItem}
                                  LL={LL}
                                  persons={persons}
                                  onCloseCell={() => setEditingCell(null)}
                                />
                              ))}
                            </tbody>
                          </SortableContext>
                          <tbody>
                            {/* ── Inline add row ──────────────────────────────── */}
                            <tr className="bg-muted/10">
                              <td className="w-8 px-1" aria-hidden="true" />
                              {visibleFields.map((field) => (
                                <td key={field.id} className="px-3 py-2.5">
                                  {field.fieldType === 'checkbox' ? (
                                    <input
                                      type="checkbox"
                                      checked={newItemValues[field.id] === 'true'}
                                      onChange={(e) =>
                                        setNewItemValues((prev) => ({
                                          ...prev,
                                          [field.id]: String(e.target.checked),
                                        }))
                                      }
                                      aria-label={field.name}
                                      className="h-4 w-4 rounded border-border"
                                    />
                                  ) : field.fieldType === 'select' ? (
                                    <select
                                      value={newItemValues[field.id] ?? ''}
                                      onChange={(e) =>
                                        setNewItemValues((prev) => ({
                                          ...prev,
                                          [field.id]: e.target.value,
                                        }))
                                      }
                                      className="w-full bg-transparent text-sm text-foreground outline-none"
                                    >
                                      <option value="">{LL.lists.selectPlaceholder()}</option>
                                      {(
                                        (field.config as Record<string, unknown> | null)
                                          ?.options as string[] | undefined
                                      )?.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type={
                                        field.fieldType === 'number'
                                          ? 'number'
                                          : field.fieldType === 'date'
                                            ? 'date'
                                            : 'text'
                                      }
                                      placeholder={LL.lists.itemNamePlaceholder()}
                                      value={newItemValues[field.id] ?? ''}
                                      onChange={(e) =>
                                        setNewItemValues((prev) => ({
                                          ...prev,
                                          [field.id]: e.target.value,
                                        }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleAddItem();
                                      }}
                                      className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                                    />
                                  )}
                                </td>
                              ))}
                              <td className="px-1 py-2.5">
                                <button
                                  type="button"
                                  onClick={handleAddItem}
                                  disabled={createItem.isPending}
                                  className="p-1 rounded-md text-muted-foreground hover:text-primary transition-colors"
                                  aria-label={LL.lists.addItem()}
                                >
                                  <PlusIcon className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </Card>
                    </DndContext>
                  </DndContext>
                )}

                {/* ── Checklist view ─────────────────────────────────────── */}
                {activeView?.viewType === 'checklist' && (
                  <div className="mb-4">
                    {!checkboxField ? (
                      <div className="flex flex-col items-center gap-3 py-10">
                        <p className="text-sm text-muted-foreground text-center">
                          {LL.lists.noCheckboxField()}
                        </p>
                        <button
                          type="button"
                          onClick={handleAddCheckboxField}
                          disabled={createField.isPending}
                          className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {LL.lists.addCheckboxField()}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground">
                            {LL.lists.checkboxFieldLabel()}: {checkboxField.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setHideDone((p) => !p)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {hideDone ? LL.lists.showDone() : LL.lists.hideDone()}
                          </button>
                        </div>
                        <Card padding="none">
                          {visibleItems.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                              {LL.lists.noUncheckedItems()}
                            </p>
                          ) : (
                            <DndContext
                              sensors={dndSensors}
                              collisionDetection={closestCenter}
                              onDragEnd={handleDragEnd}
                            >
                              <SortableContext
                                items={visibleItems.map((i) => i.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                <ul>
                                  {visibleItems.map((item, idx) => {
                                    const isDone =
                                      item.values.find((v) => v.fieldId === checkboxField.id)
                                        ?.value === 'true';
                                    const title = titleField
                                      ? (item.values.find((v) => v.fieldId === titleField.id)
                                          ?.value ?? '')
                                      : '';
                                    const extras = visibleFields
                                      .filter(
                                        (f) => f.id !== checkboxField.id && f.id !== titleField?.id
                                      )
                                      .map((f) => ({
                                        name: f.name,
                                        value: getItemValue(item, f.id, f.fieldType),
                                      }));
                                    return (
                                      <SortableChecklistItem
                                        key={item.id}
                                        item={item}
                                        isDone={isDone}
                                        title={title}
                                        isLast={idx === visibleItems.length - 1}
                                        checkboxFieldId={checkboxField.id}
                                        listId={id ?? ''}
                                        extraFields={extras}
                                        updateItem={updateItem}
                                        createItem={createItem}
                                        handleDeleteItem={handleDeleteItem}
                                        LL={LL}
                                      />
                                    );
                                  })}
                                </ul>
                              </SortableContext>
                            </DndContext>
                          )}
                          {/* ── Add checklist item ────────────────────── */}
                          {titleField && (
                            <div
                              className={`flex items-center gap-3 px-4 py-3 ${visibleItems.length > 0 ? 'border-t border-border' : ''}`}
                            >
                              {/* drag-handle spacer */}
                              <span className="w-4 h-4 flex-shrink-0" />
                              {/* unchecked checkbox placeholder */}
                              <span className="w-5 h-5 rounded border-2 border-border/40 flex-shrink-0" />
                              <input
                                type="text"
                                placeholder={LL.lists.addItem()}
                                className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/40"
                                value={newItemValues[titleField.id] ?? ''}
                                onChange={(e) =>
                                  setNewItemValues((prev) => ({
                                    ...prev,
                                    [titleField.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddItem();
                                }}
                              />
                            </div>
                          )}
                        </Card>
                      </>
                    )}
                  </div>
                )}

                {/* ── Kanban view ─────────────────────────────────────────── */}
                {activeView?.viewType === 'kanban' &&
                  (() => {
                    const cfg = activeView.config as { groupByFieldId?: string } | null;
                    const groupByField = cfg?.groupByFieldId
                      ? list.fields.find((f) => f.id === cfg.groupByFieldId)
                      : null;
                    if (!groupByField) {
                      return (
                        <p className="text-sm text-muted-foreground text-center py-8 mb-4">
                          {LL.lists.noSelectFields()}
                        </p>
                      );
                    }
                    const options =
                      ((groupByField.config as Record<string, unknown> | null)?.options as
                        | string[]
                        | undefined) ?? [];
                    const columnIds = ['__kanban_none__', ...options];
                    const columnItems: Record<string, typeof sortedItems> = Object.fromEntries(
                      columnIds.map((col) => [col, []])
                    );
                    for (const item of sortedItems) {
                      const val = item.values.find((v) => v.fieldId === groupByField.id)?.value;
                      const key = val && options.includes(val) ? val : '__kanban_none__';
                      columnItems[key]?.push(item);
                    }
                    const dragItem = kanbanDragItemId
                      ? sortedItems.find((i) => i.id === kanbanDragItemId)
                      : null;
                    return (
                      <div className="mb-4">
                        <p className="text-xs text-muted-foreground mb-2">
                          {LL.lists.kanbanGroupBy()}: {groupByField.name}
                        </p>
                        <DndContext
                          sensors={dndSensors}
                          collisionDetection={closestCenter}
                          onDragStart={(e) => handleKanbanDragStart(String(e.active.id))}
                          onDragEnd={(e) => handleKanbanDragEnd(e, groupByField.id)}
                        >
                          <div className="flex gap-4 overflow-x-auto pb-2">
                            {columnIds.map((colId) => (
                              <KanbanColumn
                                key={colId}
                                columnId={colId}
                                label={
                                  colId === '__kanban_none__' ? LL.lists.kanbanNoValue() : colId
                                }
                                items={columnItems[colId] ?? []}
                                titleFieldId={titleField?.id ?? null}
                                handleDeleteItem={handleDeleteItem}
                                LL={LL}
                              />
                            ))}
                          </div>
                          <DragOverlay>
                            {dragItem ? (
                              <div className="p-2.5 rounded-lg bg-background border border-primary shadow-lg text-sm opacity-90">
                                {titleField
                                  ? (dragItem.values.find((v) => v.fieldId === titleField.id)
                                      ?.value ?? '')
                                  : ''}
                              </div>
                            ) : null}
                          </DragOverlay>
                        </DndContext>
                      </div>
                    );
                  })()}

                {/* ── Empty items message ────────────────────────────────── */}
                {activeView?.viewType !== 'checklist' &&
                  activeView?.viewType !== 'kanban' &&
                  items.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {LL.lists.emptyItems()}
                    </p>
                  )}

                {/* ── Add field button ───────────────────────────────────── */}
                {!showAddField && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                    onClick={() => setShowAddField(true)}
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    {LL.lists.addField()}
                  </Button>
                )}
              </>
            )}

            {/* ── Add field form ─────────────────────────────────────────── */}
            {showAddField && id && (
              <AddFieldForm
                listId={id}
                onSuccess={() => {
                  void utils.lists.get.invalidate(id);
                  setShowAddField(false);
                }}
                onClose={() => setShowAddField(false)}
              />
            )}
          </>
        )}

        {/* ── Add view panel ────────────────────────────────────────────── */}
        {showAddView && list && id && (
          <AddViewPanel
            listId={id}
            list={list}
            onSuccess={(createdViewId) => {
              void utils.lists.get.invalidate(id);
              setActiveViewId(createdViewId);
              setShowAddView(false);
            }}
            onClose={() => setShowAddView(false)}
          />
        )}

        {/* ── Settings panel (slide-in) ──────────────────────────────────── */}
        {showSettings && list && id && (
          <ListSettingsPanel
            list={list}
            listId={id}
            activeViewId={activeViewId}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* ── Confirm dialogs ───────────────────────────────────────────── */}
        <ConfirmDialog
          open={!!confirmDeleteFieldId}
          title={LL.lists.removeField()}
          description={LL.lists.removeFieldConfirm()}
          confirmLabel={LL.common.remove()}
          onConfirm={handleConfirmDeleteField}
          onCancel={() => setConfirmDeleteFieldId(null)}
          variant="destructive"
        />
        <ConfirmDialog
          open={!!confirmDeleteItemId}
          title={LL.lists.deleteItem()}
          description={LL.lists.deleteItemConfirm()}
          confirmLabel={LL.common.remove()}
          onConfirm={handleConfirmDeleteItem}
          onCancel={() => setConfirmDeleteItemId(null)}
          variant="destructive"
        />
      </div>
    </AppShell>
  );
}
