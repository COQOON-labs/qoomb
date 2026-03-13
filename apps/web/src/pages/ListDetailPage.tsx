import { Button, Card, Input } from '@qoomb/ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ArrowLeftIcon, PencilIcon, PlusIcon, TrashIcon } from '../components/icons';
import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';
import { useAuth } from '../lib/auth/useAuth';
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

// ── ListDetailPage ────────────────────────────────────────────────────────────

export function ListDetailPage() {
  const { LL } = useI18nContext();
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: list, isLoading: listLoading } = trpc.lists.get.useQuery(id!, {
    enabled: !!user && !!id,
  });

  const { data: items = [], isLoading: itemsLoading } = trpc.lists.listItems.useQuery(
    { listId: id! },
    { enabled: !!user && !!id }
  );

  const isLoading = listLoading || itemsLoading;

  // Build a map: fieldId → field for quick lookup
  type ListField = NonNullable<typeof list>['fields'][number];
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
      void utils.lists.listItems.invalidate({ listId: id! });
      setNewItemValues({});
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
  const deleteItem = trpc.lists.deleteItem.useMutation({
    onSuccess: () => {
      void utils.lists.listItems.invalidate({ listId: id! });
    },
  });

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      if (!window.confirm(LL.lists.deleteItemConfirm())) return;
      deleteItem.mutate(itemId);
    },
    [LL, deleteItem]
  );

  // ── Rename list (click-to-edit) ──────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const updateList = trpc.lists.update.useMutation({
    onSuccess: () => {
      void utils.lists.get.invalidate(id);
      void utils.lists.list.invalidate();
      setEditingName(false);
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
  const deleteField = trpc.lists.deleteField.useMutation({
    onSuccess: () => {
      void utils.lists.get.invalidate(id);
      void utils.lists.listItems.invalidate({ listId: id! });
    },
  });

  const handleDeleteField = useCallback(
    (fieldId: string) => {
      if (!id || !window.confirm(LL.lists.removeFieldConfirm())) return;
      deleteField.mutate({ id: fieldId, listId: id });
    },
    [id, LL, deleteField]
  );

  // ── Inline cell editing ──────────────────────────────────────────────────
  const [editingCell, setEditingCell] = useState<{ itemId: string; fieldId: string } | null>(null);
  const [cellDraft, setCellDraft] = useState('');
  const cellInputRef = useRef<HTMLInputElement>(null);

  const updateItem = trpc.lists.updateItem.useMutation({
    onSuccess: () => {
      void utils.lists.listItems.invalidate({ listId: id! });
      setEditingCell(null);
    },
  });

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
  function getItemValue(item: (typeof items)[0], fieldId: string, fieldType: string): string {
    const val = item.values.find((v) => v.fieldId === fieldId);
    if (!val) return '';
    switch (fieldType) {
      case 'text':
      case 'url':
      case 'person':
      case 'select':
        return val.valueText ?? '';
      case 'number':
        return val.valueNumber !== null && val.valueNumber !== undefined
          ? String(val.valueNumber)
          : '';
      case 'date':
        return val.valueDate ? new Date(val.valueDate).toLocaleDateString() : '';
      case 'checkbox':
        return val.valueBoolean !== null && val.valueBoolean !== undefined
          ? val.valueBoolean
            ? '✓'
            : '✗'
          : '';
      case 'reference':
        return val.valueRef ?? '';
      default:
        return '';
    }
  }

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
                {/* ── Table ─────────────────────────────────────────────── */}
                <Card padding="none" className="overflow-x-auto mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {list.fields.map((field) => (
                          <th
                            key={field.id}
                            className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap group/th"
                          >
                            <div className="flex items-center gap-1">
                              <span>{field.name}</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteField(field.id)}
                                className="opacity-0 group-hover/th:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-all"
                                aria-label={LL.lists.removeField()}
                              >
                                <TrashIcon className="w-3 h-3" />
                              </button>
                            </div>
                          </th>
                        ))}
                        <th className="w-10">
                          <span className="sr-only">{LL.common.remove()}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-border last:border-0 hover:bg-muted/20 group"
                        >
                          {list.fields.map((field) => {
                            const cellValue = getItemValue(item, field.id, field.fieldType);
                            const isEditing =
                              editingCell?.itemId === item.id && editingCell?.fieldId === field.id;
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
                        </tr>
                      ))}

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
                      </tr>
                    </tbody>
                  </table>
                </Card>

                {/* ── Empty items message ────────────────────────────────── */}
                {items.length === 0 && (
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
      </div>
    </AppShell>
  );
}
