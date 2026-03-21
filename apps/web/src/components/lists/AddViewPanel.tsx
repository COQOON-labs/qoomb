import { Button, Card, Input } from '@qoomb/ui';
import { useCallback, useState } from 'react';

import { useI18nContext } from '../../i18n/i18n-react';
import { addToast } from '../../lib/toast';
import { trpc } from '../../lib/trpc/client';

import type { ListDetail } from './types';

interface AddViewPanelProps {
  listId: string;
  list: ListDetail;
  onSuccess: (createdViewId: string) => void;
  onClose: () => void;
}

export function AddViewPanel({ listId, list, onSuccess, onClose }: AddViewPanelProps) {
  const { LL } = useI18nContext();
  const utils = trpc.useUtils();

  const [newViewName, setNewViewName] = useState('');
  const [newViewType, setNewViewType] = useState<'table' | 'checklist' | 'kanban'>('table');
  const [newViewGroupByFieldId, setNewViewGroupByFieldId] = useState<string>('');

  const createView = trpc.lists.createView.useMutation({
    onSuccess: (created) => {
      void utils.lists.get.invalidate(listId);
      onSuccess(created.id);
      setNewViewName('');
      setNewViewType('table');
      setNewViewGroupByFieldId('');
    },
    onError: () => {
      addToast(LL.lists.createError(), 'error');
    },
  });

  const handleCreate = useCallback(() => {
    const trimmed = newViewName.trim();
    if (!trimmed) return;
    const cbField = list.fields.find((f) => f.fieldType === 'checkbox');
    const txtField = list.fields.find((f) => f.fieldType === 'text');
    const config =
      newViewType === 'checklist'
        ? { checkboxFieldId: cbField?.id ?? '', titleFieldId: txtField?.id ?? '' }
        : newViewType === 'kanban'
          ? { groupByFieldId: newViewGroupByFieldId }
          : { visibleFieldIds: list.fields.map((f) => f.id) };
    createView.mutate({ listId, name: trimmed, viewType: newViewType, config });
  }, [newViewName, newViewType, newViewGroupByFieldId, listId, list, createView]);

  const handleClose = useCallback(() => {
    setNewViewName('');
    setNewViewType('table');
    setNewViewGroupByFieldId('');
    onClose();
  }, [onClose]);

  const selectFields = list.fields.filter((f) => f.fieldType === 'select');

  return (
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
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') handleClose();
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
        {newViewType === 'kanban' && (
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
        )}
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={
              !newViewName.trim() ||
              createView.isPending ||
              (newViewType === 'kanban' && !newViewGroupByFieldId)
            }
          >
            {LL.common.create()}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            {LL.common.cancel()}
          </Button>
        </div>
      </div>
    </Card>
  );
}
