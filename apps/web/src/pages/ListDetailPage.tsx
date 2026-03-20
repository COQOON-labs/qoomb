import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { AppRouter } from '@qoomb/api/src/trpc/app.router';
import { Button, Card, ConfirmDialog, Input } from '@qoomb/ui';
import type { inferRouterOutputs } from '@trpc/server';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  ArrowLeftIcon,
  CheckIcon,
  DragHandleIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
  XIcon,
} from '../components/icons';
import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';
import { useAuth } from '../lib/auth/useAuth';
import { addToast } from '../lib/toast';
import { trpc } from '../lib/trpc/client';

// ── Field type options ────────────────────────────────────────────────────────

const FIELD_TYPES = [
  'text',
  'number',
  'date',
  'checkbox',
  'select',
  'url',
  'person',
  'reference',
] as const;

type FieldType = (typeof FIELD_TYPES)[number];

// ── Sortable table row ────────────────────────────────────────────────────────

// ── Shared local types (inferred from tRPC) ───────────────────────────────────

type RouterOutput = inferRouterOutputs<AppRouter>;
type ListField = RouterOutput['lists']['get']['fields'][number];
type ListItem = RouterOutput['lists']['listItems'][number];
type UpdateItemMutation = ReturnType<typeof trpc.lists.updateItem.useMutation>;
type LLType = ReturnType<typeof useI18nContext>['LL'];

interface SortableTableRowProps {
  item: ListItem;
  fields: ListField[];
  editingCell: { itemId: string; fieldId: string } | null;
  cellDraft: string;
  cellInputRef: React.RefObject<HTMLInputElement | null>;
  getItemValue: (item: ListItem, fieldId: string, fieldType: string) => string;
  handleCellClick: (itemId: string, fieldId: string, fieldType: string, value: string) => void;
  handleCellSave: () => void;
  handleCellKeyDown: (e: React.KeyboardEvent) => void;
  handleDeleteItem: (id: string) => void;
  setCellDraft: (v: string) => void;
  updateItem: UpdateItemMutation;
  LL: LLType;
}

function SortableTableRow({
  item,
  fields,
  editingCell,
  cellDraft,
  cellInputRef,
  getItemValue,
  handleCellClick,
  handleCellSave,
  handleCellKeyDown,
  handleDeleteItem,
  setCellDraft,
  updateItem,
  LL,
}: SortableTableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-border last:border-0 hover:bg-muted/20 group"
    >
      {fields.map((field) => {
        const cellValue = getItemValue(item, field.id, field.fieldType);
        const isEditing = editingCell?.itemId === item.id && editingCell?.fieldId === field.id;
        return (
          <td
            key={field.id}
            className="px-3 py-2.5 text-foreground cursor-pointer"
            onClick={() => {
              if (!isEditing) {
                handleCellClick(item.id, field.id, field.fieldType, cellValue);
              }
            }}
          >
            {isEditing ? (
              field.fieldType === 'select' ? (
                <select
                  value={cellDraft}
                  onChange={(e) => {
                    setCellDraft(e.target.value);
                    const val = e.target.value || null;
                    updateItem.mutate({ id: item.id, data: { values: { [field.id]: val } } });
                  }}
                  className="w-full bg-transparent text-sm text-foreground border-b border-primary outline-none"
                >
                  <option value="">{LL.lists.selectPlaceholder()}</option>
                  {(
                    (field.config as Record<string, unknown> | null)?.options as
                      | string[]
                      | undefined
                  )?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  ref={cellInputRef}
                  type={
                    field.fieldType === 'number'
                      ? 'number'
                      : field.fieldType === 'date'
                        ? 'date'
                        : 'text'
                  }
                  value={cellDraft}
                  onChange={(e) => setCellDraft(e.target.value)}
                  onBlur={handleCellSave}
                  onKeyDown={handleCellKeyDown}
                  className="w-full bg-transparent text-sm text-foreground border-b border-primary outline-none"
                />
              )
            ) : (
              cellValue || <span className="text-muted-foreground/30">—</span>
            )}
          </td>
        );
      })}
      <td className="px-2 py-2.5">
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
          onClick={() => handleDeleteItem(item.id)}
          aria-label={LL.lists.deleteItem()}
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </td>
      {/* drag handle */}
      <td className="w-6 px-1 py-2.5">
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground transition-all touch-none"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <DragHandleIcon className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

// ── Sortable checklist item ───────────────────────────────────────────────────

interface SortableChecklistItemProps {
  item: ListItem;
  isDone: boolean;
  title: string;
  isLast: boolean;
  checkboxFieldId: string;
  updateItem: UpdateItemMutation;
  handleDeleteItem: (id: string) => void;
  LL: LLType;
}

function SortableChecklistItem({
  item,
  isDone,
  title,
  isLast,
  checkboxFieldId,
  updateItem,
  handleDeleteItem,
  LL,
}: SortableChecklistItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-4 py-3 group hover:bg-muted/20 ${!isLast ? 'border-b border-border' : ''}`}
    >
      {/* drag handle */}
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground transition-all touch-none flex-shrink-0"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        aria-label={isDone ? LL.lists.showDone() : LL.lists.checkAll()}
        onClick={() =>
          updateItem.mutate({ id: item.id, data: { values: { [checkboxFieldId]: !isDone } } })
        }
        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          isDone
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-border hover:border-primary'
        }`}
      >
        {isDone && <CheckIcon className="w-3 h-3" />}
      </button>
      <span
        className={`flex-1 text-sm ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}
      >
        {title || <span className="text-muted-foreground/40">—</span>}
      </span>
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
        onClick={() => handleDeleteItem(item.id)}
        aria-label={LL.lists.deleteItem()}
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

// ── Kanban card ───────────────────────────────────────────────────────────────

interface KanbanCardProps {
  item: ListItem;
  titleFieldId: string | null;
  handleDeleteItem: (id: string) => void;
  LL: LLType;
}

function KanbanCard({ item, titleFieldId, handleDeleteItem, LL }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const title = titleFieldId
    ? (item.values.find((v) => v.fieldId === titleFieldId)?.value ?? '')
    : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-2.5 rounded-lg bg-background border border-border shadow-sm text-sm group cursor-grab active:cursor-grabbing select-none touch-none ${
        isDragging ? 'opacity-40' : ''
      }`}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex-1 text-foreground break-words min-w-0">
          {title || <span className="text-muted-foreground/40">—</span>}
        </span>
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteItem(item.id);
          }}
          aria-label={LL.lists.deleteItem()}
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Kanban column ─────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  columnId: string;
  label: string;
  items: ListItem[];
  titleFieldId: string | null;
  handleDeleteItem: (id: string) => void;
  LL: LLType;
}

function KanbanColumn({
  columnId,
  label,
  items,
  titleFieldId,
  handleDeleteItem,
  LL,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[220px] max-w-[220px] rounded-xl border transition-colors ${
        isOver ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/20'
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-sm font-semibold text-foreground truncate">{label}</span>
        <span className="ml-2 text-xs text-muted-foreground flex-shrink-0">{items.length}</span>
      </div>
      {/* Cards */}
      <div className="flex flex-col gap-2 p-2.5 min-h-[80px]">
        {items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            titleFieldId={titleFieldId}
            handleDeleteItem={handleDeleteItem}
            LL={LL}
          />
        ))}
      </div>
    </div>
  );
}

// ── ListDetailPage ────────────────────────────────────────────────────────────

export function ListDetailPage() {
  const { LL } = useI18nContext();
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

  const isLoading = listLoading || itemsLoading;

  // Build a map: fieldId → field for quick lookup
  const fieldMap = useMemo(() => {
    if (!list) return new Map<string, ListField>();
    return new Map(list.fields.map((f) => [f.id, f]));
  }, [list]);

  // ── Add field form ───────────────────────────────────────────────────────
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');

  const createField = trpc.lists.createField.useMutation({
    onSuccess: () => {
      void utils.lists.get.invalidate(id);
      setNewFieldName('');
      setNewFieldType('text');
      setShowAddField(false);
    },
    onError: () => {
      addToast(LL.lists.createError(), 'error');
    },
  });

  const handleAddFieldSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const name = newFieldName.trim();
      if (!name || !id) return;
      createField.mutate({ listId: id, name, fieldType: newFieldType });
    },
    [newFieldName, newFieldType, id, createField]
  );

  // ── Add item ─────────────────────────────────────────────────────────────
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
    // Convert string values to appropriate types based on field type
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

  // ── Delete item ──────────────────────────────────────────────────────────
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

  // ── Rename list (click-to-edit) ──────────────────────────────────────────
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
    // Focus input after React renders it
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

  // ── Icon picker ──────────────────────────────────────────────────────────
  const [showIconPicker, setShowIconPicker] = useState(false);
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

  const handleIconSelect = useCallback(
    (icon: string) => {
      if (!id) return;
      updateList.mutate({ id, data: { icon } });
      setShowIconPicker(false);
    },
    [id, updateList]
  );

  // ── Archive toggle ───────────────────────────────────────────────────────
  const handleToggleArchive = useCallback(() => {
    if (!id || !list) return;
    updateList.mutate({ id, data: { isArchived: !list.isArchived } });
  }, [id, list, updateList]);

  // ── Remove field ─────────────────────────────────────────────────────────
  const [confirmDeleteFieldId, setConfirmDeleteFieldId] = useState<string | null>(null);

  const deleteField = trpc.lists.deleteField.useMutation({
    onSuccess: () => {
      void utils.lists.get.invalidate(id);
      void utils.lists.listItems.invalidate({ listId: id ?? '' });
      setColumnMenuFieldId(null);
    },
    onError: () => {
      addToast(LL.lists.deleteError(), 'error');
    },
  });

  const handleDeleteField = useCallback((fieldId: string) => {
    setConfirmDeleteFieldId(fieldId);
  }, []);

  const handleConfirmDeleteField = useCallback(() => {
    if (!confirmDeleteFieldId || !id) return;
    deleteField.mutate({ id: confirmDeleteFieldId, listId: id });
    setConfirmDeleteFieldId(null);
  }, [confirmDeleteFieldId, id, deleteField]);

  // ── Column header menu ───────────────────────────────────────────────────
  const [columnMenuFieldId, setColumnMenuFieldId] = useState<string | null>(null);

  // ── Field editing (rename + select options) ─────────────────────────────
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldDraftName, setFieldDraftName] = useState('');
  const [fieldDraftOptions, setFieldDraftOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState('');

  const updateField = trpc.lists.updateField.useMutation({
    onSuccess: () => {
      void utils.lists.get.invalidate(id);
      setEditingFieldId(null);
      addToast(LL.lists.fieldSaved());
    },
    onError: () => {
      addToast(LL.lists.updateError(), 'error');
    },
  });

  const handleStartEditField = useCallback(
    (fieldId: string) => {
      const field = fieldMap.get(fieldId);
      if (!field || !id) return;
      setFieldDraftName(field.name);
      const config = field.config as Record<string, unknown> | null;
      setFieldDraftOptions(Array.isArray(config?.options) ? (config.options as string[]) : []);
      setEditingFieldId(fieldId);
      setColumnMenuFieldId(null);
    },
    [fieldMap, id]
  );

  const handleSaveField = useCallback(() => {
    if (!editingFieldId || !id) return;
    const field = fieldMap.get(editingFieldId);
    if (!field) return;
    const trimmed = fieldDraftName.trim();
    if (!trimmed) return;
    updateField.mutate({
      id: editingFieldId,
      listId: id,
      data: {
        name: trimmed,
        ...(field.fieldType === 'select' ? { config: { options: fieldDraftOptions } } : {}),
      },
    });
  }, [editingFieldId, id, fieldMap, fieldDraftName, fieldDraftOptions, updateField]);

  const handleAddOption = useCallback(() => {
    const trimmed = newOption.trim();
    if (!trimmed || fieldDraftOptions.includes(trimmed)) return;
    setFieldDraftOptions((prev) => [...prev, trimmed]);
    setNewOption('');
  }, [newOption, fieldDraftOptions]);

  const handleRemoveOption = useCallback((opt: string) => {
    setFieldDraftOptions((prev) => prev.filter((o) => o !== opt));
  }, []);

  // ── Settings panel ──────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);

  const handleVisibilityChange = useCallback(
    (v: string) => {
      if (!id) return;
      updateList.mutate({ id, data: { visibility: v as 'hive' | 'admins' | 'group' | 'private' } });
    },
    [id, updateList]
  );

  // ── Views ────────────────────────────────────────────────────────────────
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showAddView, setShowAddView] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewType, setNewViewType] = useState<'table' | 'checklist' | 'kanban'>('table');
  const [newViewGroupByFieldId, setNewViewGroupByFieldId] = useState<string>('');
  const [hideDone, setHideDone] = useState(false);
  // Kanban drag state
  const [kanbanDragItemId, setKanbanDragItemId] = useState<string | null>(null);

  const createView = trpc.lists.createView.useMutation({
    onSuccess: (created) => {
      void utils.lists.get.invalidate(id);
      setActiveViewId(created.id);
      setShowAddView(false);
      setNewViewName('');
      setNewViewType('table');
      setNewViewGroupByFieldId('');
    },
    onError: () => {
      addToast(LL.lists.createError(), 'error');
    },
  });

  const handleAddView = useCallback(() => {
    const trimmed = newViewName.trim();
    if (!trimmed || !id) return;
    const cbField = list?.fields.find((f) => f.fieldType === 'checkbox');
    const config =
      newViewType === 'checklist'
        ? { checkboxFieldId: cbField?.id ?? '' }
        : newViewType === 'kanban'
          ? { groupByFieldId: newViewGroupByFieldId }
          : { visibleFieldIds: list?.fields.map((f) => f.id) ?? [] };
    createView.mutate({ listId: id, name: trimmed, viewType: newViewType, config });
  }, [newViewName, newViewType, newViewGroupByFieldId, id, list, createView]);

  // ── Drag & drop reorder ───────────────────────────────────────────────────
  // Track the display order locally so we can reorder optimistically.
  // Keeps IDs in sorted order; falls back to server order on invalidate.
  const [localItemOrder, setLocalItemOrder] = useState<string[] | null>(null);

  const reorderItems = trpc.lists.reorderItems.useMutation({
    onError: () => {
      addToast(LL.lists.updateError(), 'error');
      setLocalItemOrder(null); // roll back on failure
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
        // Persist: assign sortOrder = index (integer, simple)
        reorderItems.mutate({
          listId: id,
          items: next.map((itemId, idx) => ({ id: itemId, sortOrder: idx })),
        });
        return next;
      });
    },
    [id, items, reorderItems]
  );

  // ── Inline cell editing ──────────────────────────────────────────────────
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
      // Checkboxes toggle immediately instead of opening an editor
      if (fieldType === 'checkbox') {
        const newVal = currentValue !== '✓';
        updateItem.mutate({ id: itemId, data: { values: { [fieldId]: newVal } } });
        return;
      }
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

  // ── Render helpers ───────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    void navigate('/lists');
  }, [navigate]);

  /** Resolve item value for a given field */
  const getItemValue = useCallback(
    (item: (typeof items)[0], fieldId: string, fieldType: string): string => {
      const val = item.values.find((v) => v.fieldId === fieldId);
      if (!val || val.value === null || val.value === undefined) return '';
      switch (fieldType) {
        case 'checkbox':
          return val.value === 'true' ? '✓' : '✗';
        case 'date':
          return new Date(val.value).toLocaleDateString();
        default:
          return val.value;
      }
    },
    []
  );

  // ── View-derived computations ─────────────────────────────────────────────
  const activeView = useMemo(
    () => list?.views.find((v) => v.id === activeViewId) ?? list?.views[0] ?? null,
    [list, activeViewId]
  );

  const checkboxField = useMemo(
    () => list?.fields.find((f) => f.fieldType === 'checkbox') ?? null,
    [list]
  );

  // Apply local drag order (optimistic), then fall back to server sortOrder
  const sortedItems = useMemo(() => {
    if (localItemOrder) {
      const byId = new Map(items.map((i) => [i.id, i]));
      return localItemOrder.map((itemId) => byId.get(itemId)).filter(Boolean) as typeof items;
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

  // ── Not found / loading ──────────────────────────────────────────────────
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
                      className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
                        isActive
                          ? 'border-primary text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
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
                  <Card padding="none" className="overflow-x-auto mb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          {list.fields.map((field) => (
                            <th
                              key={field.id}
                              className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap group/th relative"
                            >
                              <div className="flex items-center gap-1">
                                <span>{field.name}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setColumnMenuFieldId((prev) =>
                                      prev === field.id ? null : field.id
                                    )
                                  }
                                  className="opacity-0 group-hover/th:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground transition-all"
                                  aria-label={LL.lists.fieldConfig()}
                                >
                                  <EllipsisVerticalIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {columnMenuFieldId === field.id && (
                                <div className="absolute top-full left-0 mt-1 z-20 bg-background border border-border rounded-lg shadow-lg min-w-[160px]">
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                                    onClick={() => handleStartEditField(field.id)}
                                  >
                                    {LL.lists.renameField()}
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                                    onClick={() => {
                                      setColumnMenuFieldId(null);
                                      handleDeleteField(field.id);
                                    }}
                                  >
                                    {LL.lists.removeField()}
                                  </button>
                                </div>
                              )}
                            </th>
                          ))}
                          <th className="w-10">
                            <span className="sr-only">{LL.common.remove()}</span>
                          </th>
                          {/* drag handle column */}
                          <th className="w-6" aria-hidden="true" />
                        </tr>
                      </thead>
                      <DndContext
                        sensors={dndSensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={sortedItems.map((i) => i.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <tbody>
                            {sortedItems.map((item) => (
                              <SortableTableRow
                                key={item.id}
                                item={item}
                                fields={list.fields}
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
                              />
                            ))}
                          </tbody>
                        </SortableContext>
                      </DndContext>
                      <tbody>
                        {/* ── Inline add row ──────────────────────────────── */}
                        <tr className="bg-muted/10">
                          {list.fields.map((field) => (
                            <td key={field.id} className="px-3 py-2">
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
                                    (field.config as Record<string, unknown> | null)?.options as
                                      | string[]
                                      | undefined
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
                          <td className="px-2 py-2">
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
                          {/* spacer for drag handle column */}
                          <td className="w-6" aria-hidden="true" />
                        </tr>
                      </tbody>
                    </table>
                  </Card>
                )}{' '}
                {/* end table view */}
                {/* ── Checklist view ─────────────────────────────────────── */}
                {activeView?.viewType === 'checklist' && (
                  <div className="mb-4">
                    {!checkboxField ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        {LL.lists.noCheckboxField()}
                      </p>
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
                                    const titleField = list.fields.find(
                                      (f) => f.fieldType === 'text'
                                    );
                                    const title = titleField
                                      ? (item.values.find((v) => v.fieldId === titleField.id)
                                          ?.value ?? '')
                                      : '';
                                    return (
                                      <SortableChecklistItem
                                        key={item.id}
                                        item={item}
                                        isDone={isDone}
                                        title={title}
                                        isLast={idx === visibleItems.length - 1}
                                        checkboxFieldId={checkboxField.id}
                                        updateItem={updateItem}
                                        handleDeleteItem={handleDeleteItem}
                                        LL={LL}
                                      />
                                    );
                                  })}
                                </ul>
                              </SortableContext>
                            </DndContext>
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
                    const titleField = list.fields.find((f) => f.fieldType === 'text');
                    // Group items by their select field value
                    const columnIds = ['__kanban_none__', ...options];
                    const columnItems: Record<string, ListItem[]> = Object.fromEntries(
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

            {/* ── Add field form ───────────────────────────────────────── */}
            {showAddField && (
              <Card padding="md" className="mt-4">
                <form onSubmit={handleAddFieldSubmit} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input
                      label={LL.lists.fieldNameLabel()}
                      placeholder={LL.lists.fieldNamePlaceholder()}
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                    />
                  </div>
                  <div className="w-40">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {LL.lists.fieldTypeLabel()}
                    </label>
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value as FieldType)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      {FIELD_TYPES.map((ft) => (
                        <option key={ft} value={ft}>
                          {LL.lists.fieldTypes[ft]()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 pb-0.5">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={!newFieldName.trim() || createField.isPending}
                    >
                      {LL.lists.addField()}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAddField(false);
                        setNewFieldName('');
                      }}
                    >
                      {LL.common.cancel()}
                    </Button>
                  </div>
                </form>
              </Card>
            )}
          </>
        )}

        {/* ── Add view panel ──────────────────────────────────────────── */}
        {showAddView && list && (
          <Card padding="md" className="mt-4">
            <p className="text-sm font-semibold text-foreground mb-3">{LL.lists.addView()}</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {LL.lists.newViewName()}
                </label>
                <Input
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddView();
                    if (e.key === 'Escape') setShowAddView(false);
                  }}
                  placeholder={LL.lists.newViewName()}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {LL.lists.viewsLabel()}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {(['table', 'checklist', 'kanban'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewViewType(type)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        newViewType === type
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {type === 'table'
                        ? LL.lists.viewType.table()
                        : type === 'checklist'
                          ? LL.lists.viewType.checklist()
                          : LL.lists.viewType.kanban()}
                    </button>
                  ))}
                </div>
              </div>
              {newViewType === 'kanban' &&
                (() => {
                  const selectFields = list?.fields.filter((f) => f.fieldType === 'select') ?? [];
                  return (
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        {LL.lists.kanbanGroupBy()}
                      </label>
                      {selectFields.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{LL.lists.noSelectFields()}</p>
                      ) : (
                        <select
                          value={newViewGroupByFieldId}
                          onChange={(e) => setNewViewGroupByFieldId(e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                        >
                          <option value="">{LL.lists.selectPlaceholder()}</option>
                          {selectFields.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })()}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleAddView}
                  disabled={
                    !newViewName.trim() ||
                    createView.isPending ||
                    (newViewType === 'kanban' && !newViewGroupByFieldId)
                  }
                >
                  {LL.common.create()}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAddView(false);
                    setNewViewName('');
                    setNewViewType('table');
                    setNewViewGroupByFieldId('');
                  }}
                >
                  {LL.common.cancel()}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ── Settings panel ─────────────────────────────────────────── */}
        {list && (
          <div className="mt-6">
            <button
              type="button"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowSettings((p) => !p)}
            >
              <SettingsIcon className="w-4 h-4" />
              {LL.lists.settings()}
            </button>
            {showSettings && (
              <Card padding="md" className="mt-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {LL.lists.visibilityLabel()}
                </label>
                <select
                  value={list.visibility}
                  onChange={(e) => handleVisibilityChange(e.target.value)}
                  className="w-full max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {(['hive', 'admins', 'group', 'private'] as const).map((v) => (
                    <option key={v} value={v}>
                      {LL.lists.visibility[v]()}
                    </option>
                  ))}
                </select>
              </Card>
            )}
          </div>
        )}

        {/* ── Field editing panel ────────────────────────────────────── */}
        {editingFieldId &&
          (() => {
            const field = fieldMap.get(editingFieldId);
            if (!field) return null;
            return (
              <Card padding="md" className="mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">{LL.lists.fieldConfig()}</h3>
                  <button
                    type="button"
                    onClick={() => setEditingFieldId(null)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <Input
                    label={LL.lists.fieldNameLabel()}
                    value={fieldDraftName}
                    onChange={(e) => setFieldDraftName(e.target.value)}
                  />
                  {field.fieldType === 'select' && (
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        {LL.lists.selectOptions()}
                      </label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {fieldDraftOptions.map((opt) => (
                          <span
                            key={opt}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-foreground"
                          >
                            {opt}
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(opt)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <XIcon className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder={LL.lists.optionPlaceholder()}
                          value={newOption}
                          onChange={(e) => setNewOption(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddOption();
                            }
                          }}
                        />
                        <Button variant="ghost" size="sm" onClick={handleAddOption}>
                          {LL.lists.addOption()}
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveField}
                      disabled={!fieldDraftName.trim() || updateField.isPending}
                    >
                      {LL.lists.saveField()}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingFieldId(null)}>
                      {LL.common.cancel()}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })()}

        {/* ── Confirm dialogs ────────────────────────────────────────── */}
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
