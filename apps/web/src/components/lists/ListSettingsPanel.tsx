import {
  DndContext,
  PointerSensor,
  closestCenter,
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
import { Button, Input } from '@qoomb/ui';
import { useCallback, useMemo, useState } from 'react';

import { useI18nContext } from '../../i18n/i18n-react';
import { addToast } from '../../lib/toast';
import { trpc } from '../../lib/trpc/client';
import {
  ArrowLeftIcon,
  DragHandleIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
  XIcon,
} from '../icons';

import { AddFieldForm } from './AddFieldForm';
import { canDeleteField, canToggleVisibility, type ViewInfo } from './listFieldGuards';
import type { ListDetail, ListField, LLType } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ListSettingsPanelProps {
  list: ListDetail;
  listId: string;
  activeViewId: string | null;
  onClose: () => void;
}

interface FieldDetailProps {
  field: ListField;
  listId: string;
  onBack: () => void;
  onDeleteField: (fieldId: string) => void;
  deleteGuardReason: string | null;
}

// ── Sortable field row ────────────────────────────────────────────────────────

interface SortableFieldRowProps {
  field: ListField;
  isVisible: boolean;
  visibilityBlocked: boolean;
  visibilityBlockReason: string | null;
  deleteBlocked: boolean;
  deleteBlockReason: string | null;
  onToggleVisibility: (fieldId: string) => void;
  onOpenDetail: (fieldId: string) => void;
  onDeleteField: (fieldId: string) => void;
  LL: LLType;
}

function SortableFieldRow({
  field,
  isVisible,
  visibilityBlocked,
  visibilityBlockReason,
  deleteBlocked,
  deleteBlockReason,
  onToggleVisibility,
  onOpenDetail,
  onDeleteField,
  LL,
}: SortableFieldRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors group"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-all shrink-0"
        aria-label={LL.lists.dragToReorder()}
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon className="w-3.5 h-3.5" />
      </button>

      <span className="text-xs text-muted-foreground/70 w-5 text-center shrink-0">
        {fieldTypeIcon(field.fieldType)}
      </span>

      <span className="flex-1 text-sm text-foreground truncate">{field.name}</span>

      <button
        type="button"
        onClick={() => onToggleVisibility(field.id)}
        disabled={visibilityBlocked}
        className={`p-1 rounded transition-colors shrink-0 ${
          visibilityBlocked
            ? 'text-muted-foreground/30 cursor-not-allowed'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-label={
          isVisible ? LL.lists.settingsPanel.hideField() : LL.lists.settingsPanel.showField()
        }
        title={visibilityBlockReason ?? undefined}
      >
        {isVisible ? (
          <EyeIcon className="w-3.5 h-3.5" />
        ) : (
          <EyeOffIcon className="w-3.5 h-3.5 opacity-40" />
        )}
      </button>

      <button
        type="button"
        onClick={() => onDeleteField(field.id)}
        disabled={deleteBlocked}
        className={`p-1 rounded transition-colors shrink-0 ${
          deleteBlocked
            ? 'text-muted-foreground/30 cursor-not-allowed'
            : 'text-muted-foreground hover:text-destructive'
        }`}
        aria-label={LL.lists.removeField()}
        title={deleteBlockReason ?? undefined}
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={() => onOpenDetail(field.id)}
        className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
        aria-label={LL.lists.fieldConfig()}
      >
        <SettingsIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Field type icon helper ────────────────────────────────────────────────────

function fieldTypeIcon(type: string): string {
  switch (type) {
    case 'text':
      return 'Aa';
    case 'number':
      return '#';
    case 'date':
      return '📅';
    case 'checkbox':
      return '☑';
    case 'select':
      return '🏷';
    case 'url':
      return '🔗';
    case 'person':
      return '👤';
    case 'reference':
      return '↗';
    default:
      return '·';
  }
}

// ── Field detail subpanel ─────────────────────────────────────────────────────

function FieldDetail({
  field,
  listId,
  onBack,
  onDeleteField,
  deleteGuardReason,
}: FieldDetailProps) {
  const { LL } = useI18nContext();
  const utils = trpc.useUtils();

  const [draftName, setDraftName] = useState(field.name);
  const [draftOptions, setDraftOptions] = useState<string[]>(() => {
    const config = field.config as Record<string, unknown> | null;
    return Array.isArray(config?.options) ? (config.options as string[]) : [];
  });
  const [newOption, setNewOption] = useState('');

  const updateField = trpc.lists.updateField.useMutation({
    onSuccess: () => {
      void utils.lists.get.invalidate(listId);
      addToast(LL.lists.fieldSaved());
    },
    onError: () => {
      addToast(LL.lists.updateError(), 'error');
    },
  });

  const handleSave = useCallback(() => {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    updateField.mutate({
      id: field.id,
      listId,
      data: {
        name: trimmed,
        ...(field.fieldType === 'select' ? { config: { options: draftOptions } } : {}),
      },
    });
  }, [field, listId, draftName, draftOptions, updateField]);

  const handleAddOption = useCallback(() => {
    const trimmed = newOption.trim();
    if (!trimmed || draftOptions.includes(trimmed)) return;
    setDraftOptions((prev) => [...prev, trimmed]);
    setNewOption('');
  }, [newOption, draftOptions]);

  const handleRemoveOption = useCallback((opt: string) => {
    setDraftOptions((prev) => prev.filter((o) => o !== opt));
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button
          type="button"
          onClick={onBack}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          aria-label={LL.common.back()}
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground truncate">{field.name}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <Input
          label={LL.lists.fieldNameLabel()}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
        />

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {LL.lists.fieldTypeLabel()}
          </label>
          <p className="text-sm text-foreground">
            {fieldTypeIcon(field.fieldType)}{' '}
            {LL.lists.fieldTypes[field.fieldType as keyof typeof LL.lists.fieldTypes]?.() ??
              field.fieldType}
          </p>
        </div>

        {/* Select options */}
        {field.fieldType === 'select' && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {LL.lists.selectOptions()}
            </label>
            <div className="space-y-1 mb-2">
              {draftOptions.map((opt) => (
                <div
                  key={opt}
                  className="flex items-center justify-between px-2 py-1 rounded bg-muted/50 text-sm"
                >
                  <span>{opt}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(opt)}
                    className="p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
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

        {/* Save */}
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!draftName.trim() || updateField.isPending}
          >
            {LL.lists.saveField()}
          </Button>
        </div>

        {/* Delete */}
        <div className="border-t border-border pt-4">
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => onDeleteField(field.id)}
            disabled={!!deleteGuardReason}
            title={deleteGuardReason ?? undefined}
          >
            <TrashIcon className="w-3.5 h-3.5" />
            {LL.lists.removeField()}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main settings panel ───────────────────────────────────────────────────────

export function ListSettingsPanel({ list, listId, activeViewId, onClose }: ListSettingsPanelProps) {
  const { LL } = useI18nContext();
  const utils = trpc.useUtils();

  // ── State ────────────────────────────────────────────────────────────────
  const [detailFieldId, setDetailFieldId] = useState<string | null>(null);
  const [showAddField, setShowAddField] = useState(false);
  const [localFieldOrder, setLocalFieldOrder] = useState<string[] | null>(null);

  const activeView = useMemo(
    () => list.views.find((v) => v.id === activeViewId) ?? list.views[0] ?? null,
    [list, activeViewId]
  );

  const detailField = useMemo(
    () => (detailFieldId ? (list.fields.find((f) => f.id === detailFieldId) ?? null) : null),
    [list, detailFieldId]
  );

  // ── Visible field IDs (from active view config) ─────────────────────────
  const visibleFieldIds = useMemo(() => {
    const cfg = activeView?.config as { visibleFieldIds?: string[] } | null;
    if (cfg?.visibleFieldIds) return new Set(cfg.visibleFieldIds);
    // Default: all fields visible
    return new Set(list.fields.map((f) => f.id));
  }, [activeView, list.fields]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const updateList = trpc.lists.update.useMutation({
    onSuccess: () => {
      void utils.lists.get.invalidate(listId);
      void utils.lists.list.invalidate();
      addToast(LL.lists.updateSuccess());
    },
    onError: () => {
      addToast(LL.lists.updateError(), 'error');
    },
  });

  const updateView = trpc.lists.updateView.useMutation({
    onSuccess: () => {
      void utils.lists.get.invalidate(listId);
    },
    onError: () => {
      addToast(LL.lists.updateError(), 'error');
    },
  });

  const reorderFields = trpc.lists.reorderFields.useMutation({
    onSuccess: () => {
      setLocalFieldOrder(null);
      void utils.lists.get.invalidate(listId);
    },
    onError: () => {
      addToast(LL.lists.updateError(), 'error');
      setLocalFieldOrder(null);
    },
  });

  // ── Sorted fields ───────────────────────────────────────────────────────
  const sortedFields = useMemo(() => {
    if (!localFieldOrder) return list.fields;
    return localFieldOrder
      .map((fid) => list.fields.find((f) => f.id === fid))
      .filter(Boolean) as typeof list.fields;
  }, [list, localFieldOrder]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleVisibilityChange = useCallback(
    (v: string) => {
      updateList.mutate({
        id: listId,
        data: { visibility: v as 'hive' | 'admins' | 'group' | 'private' },
      });
    },
    [listId, updateList]
  );

  // ── Guard context ─────────────────────────────────────────────────────
  const viewInfos: ViewInfo[] = useMemo(
    () =>
      list.views.map((v) => ({
        viewType: v.viewType,
        config: (v.config as Record<string, unknown> | null) ?? null,
      })),
    [list.views]
  );

  const activeViewInfo: ViewInfo | null = useMemo(
    () =>
      activeView
        ? {
            viewType: activeView.viewType,
            config: (activeView.config as Record<string, unknown> | null) ?? null,
          }
        : null,
    [activeView]
  );

  const handleToggleFieldVisibility = useCallback(
    (fieldId: string) => {
      if (!activeView) return;
      const isVisible = visibleFieldIds.has(fieldId);
      const guard = canToggleVisibility(
        fieldId,
        isVisible,
        list.fields,
        visibleFieldIds,
        activeViewInfo
      );
      if (!guard.allowed) return;

      const current = new Set(visibleFieldIds);
      if (isVisible) {
        current.delete(fieldId);
      } else {
        current.add(fieldId);
      }
      // Merge visibleFieldIds into the existing view config so the
      // union schema (checklist / table / kanban) validates correctly.
      const existingConfig = (activeView.config as Record<string, unknown> | null) ?? {};
      updateView.mutate({
        id: activeView.id,
        listId,
        data: {
          config: {
            ...existingConfig,
            visibleFieldIds: [...current],
          },
        },
      });
    },
    [activeView, listId, list.fields, visibleFieldIds, updateView, activeViewInfo]
  );

  // ── Field reorder (DnD) ─────────────────────────────────────────────────
  const fieldDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleFieldDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const fieldIds = localFieldOrder ?? list.fields.map((f) => f.id);
      const oldIdx = fieldIds.indexOf(String(active.id));
      const newIdx = fieldIds.indexOf(String(over.id));
      if (oldIdx === -1 || newIdx === -1) return;

      const next = arrayMove(fieldIds, oldIdx, newIdx);
      setLocalFieldOrder(next);
      reorderFields.mutate({
        listId,
        fields: next.map((id, idx) => ({ id, sortOrder: idx })),
      });
    },
    [list, listId, localFieldOrder, reorderFields]
  );

  // ── View config handlers ────────────────────────────────────────────────
  const handleCheckboxFieldChange = useCallback(
    (checkboxFieldId: string) => {
      if (!activeView) return;
      const cfg = activeView.config as { titleFieldId?: string } | null;
      updateView.mutate({
        id: activeView.id,
        listId,
        data: {
          config: {
            checkboxFieldId,
            ...(cfg?.titleFieldId ? { titleFieldId: cfg.titleFieldId } : {}),
          },
        },
      });
    },
    [activeView, listId, updateView]
  );

  const handleTitleFieldChange = useCallback(
    (titleFieldId: string) => {
      if (!activeView) return;
      const cfg = activeView.config as { checkboxFieldId?: string } | null;
      updateView.mutate({
        id: activeView.id,
        listId,
        data: { config: { checkboxFieldId: cfg?.checkboxFieldId ?? '', titleFieldId } },
      });
    },
    [activeView, listId, updateView]
  );

  const handleGroupByChange = useCallback(
    (groupByFieldId: string) => {
      if (!activeView) return;
      updateView.mutate({
        id: activeView.id,
        listId,
        data: { config: { groupByFieldId } },
      });
    },
    [activeView, listId, updateView]
  );

  const handleDeleteField = useCallback(
    (fieldId: string) => {
      setDetailFieldId(null);
      // Delegate to parent — the confirm dialog lives in ListDetailPage
      onClose();
      // We emit a custom event that ListDetailPage listens for
      window.dispatchEvent(new CustomEvent('list-settings:delete-field', { detail: { fieldId } }));
    },
    [onClose]
  );

  // ── Render ──────────────────────────────────────────────────────────────

  // Field detail subpanel
  if (detailField) {
    const delGuard = canDeleteField(detailField.id, list.fields, viewInfos);
    const delReason = delGuard.allowed
      ? null
      : (LL.lists.settingsPanel.guards[
          delGuard.reason as keyof typeof LL.lists.settingsPanel.guards
        ]?.() ?? delGuard.reason);
    return (
      <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-sm bg-background border-l border-border shadow-xl flex flex-col">
        <FieldDetail
          field={detailField}
          listId={listId}
          onBack={() => setDetailFieldId(null)}
          onDeleteField={handleDeleteField}
          deleteGuardReason={delReason}
        />
      </aside>
    );
  }

  // Main panel (Level 1)
  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-sm bg-background border-l border-border shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            {LL.lists.settingsPanel.title()}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          aria-label={LL.common.close()}
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* ── List section ─────────────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {LL.lists.settingsPanel.listSection()}
          </h3>

          <div className="space-y-3">
            {/* Visibility */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {LL.lists.visibilityLabel()}
              </label>
              <select
                value={list.visibility}
                onChange={(e) => handleVisibilityChange(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {(['hive', 'admins', 'group', 'private'] as const).map((v) => (
                  <option key={v} value={v}>
                    {LL.lists.visibility[v]()}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ── Fields section ───────────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {LL.lists.settingsPanel.fieldsSection()}
          </h3>

          <DndContext
            sensors={fieldDndSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleFieldDragEnd}
          >
            <SortableContext
              items={sortedFields.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-0.5">
                {sortedFields.map((field) => {
                  const isVisible = visibleFieldIds.has(field.id);
                  const visGuard = canToggleVisibility(
                    field.id,
                    isVisible,
                    list.fields,
                    visibleFieldIds,
                    activeViewInfo
                  );
                  const delGuard = canDeleteField(field.id, list.fields, viewInfos);
                  const visReason = visGuard.allowed
                    ? null
                    : (LL.lists.settingsPanel.guards[
                        visGuard.reason as keyof typeof LL.lists.settingsPanel.guards
                      ]?.() ?? visGuard.reason);
                  const delReason = delGuard.allowed
                    ? null
                    : (LL.lists.settingsPanel.guards[
                        delGuard.reason as keyof typeof LL.lists.settingsPanel.guards
                      ]?.() ?? delGuard.reason);
                  return (
                    <SortableFieldRow
                      key={field.id}
                      field={field}
                      isVisible={isVisible}
                      visibilityBlocked={!visGuard.allowed}
                      visibilityBlockReason={visReason}
                      deleteBlocked={!delGuard.allowed}
                      deleteBlockReason={delReason}
                      onToggleVisibility={handleToggleFieldVisibility}
                      onOpenDetail={setDetailFieldId}
                      onDeleteField={handleDeleteField}
                      LL={LL}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>

          {/* Add field */}
          {showAddField ? (
            <div className="mt-3">
              <AddFieldForm
                listId={listId}
                onSuccess={() => {
                  void utils.lists.get.invalidate(listId);
                  setShowAddField(false);
                }}
                onClose={() => setShowAddField(false)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddField(true)}
              className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              {LL.lists.addField()}
            </button>
          )}
        </section>

        {/* ── Active view section ──────────────────────────────────── */}
        {activeView && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {LL.lists.settingsPanel.viewSection({
                name: activeView.name,
              })}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {LL.lists.settingsPanel.viewTypeLabel()}
                </label>
                <p className="text-sm text-foreground">
                  {LL.lists.viewType[activeView.viewType as keyof typeof LL.lists.viewType]?.() ??
                    activeView.viewType}
                </p>
              </div>

              {/* Checklist: checkbox field picker */}
              {activeView.viewType === 'checklist' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {LL.lists.checkboxFieldLabel()}
                    </label>
                    <select
                      value={
                        (activeView.config as { checkboxFieldId?: string } | null)
                          ?.checkboxFieldId ?? ''
                      }
                      onChange={(e) => handleCheckboxFieldChange(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="">{LL.lists.selectPlaceholder()}</option>
                      {list.fields
                        .filter((f) => f.fieldType === 'checkbox')
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {LL.lists.titleFieldLabel()}
                    </label>
                    <select
                      value={
                        (activeView.config as { titleFieldId?: string } | null)?.titleFieldId ?? ''
                      }
                      onChange={(e) => handleTitleFieldChange(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="">{LL.lists.selectPlaceholder()}</option>
                      {list.fields
                        .filter((f) => f.fieldType === 'text')
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Kanban: group-by field picker */}
              {activeView.viewType === 'kanban' && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    {LL.lists.kanbanGroupBy()}
                  </label>
                  <select
                    value={
                      (activeView.config as { groupByFieldId?: string } | null)?.groupByFieldId ??
                      ''
                    }
                    onChange={(e) => handleGroupByChange(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="">{LL.lists.selectPlaceholder()}</option>
                    {list.fields
                      .filter((f) => f.fieldType === 'select')
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
