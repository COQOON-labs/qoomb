import { Button, Card, Input } from '@qoomb/ui';
import { useCallback, useState } from 'react';

import { useI18nContext } from '../../i18n/i18n-react';
import { addToast } from '../../lib/toast';
import { trpc } from '../../lib/trpc/client';

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

// ── Component ─────────────────────────────────────────────────────────────────

interface AddFieldFormProps {
  listId: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function AddFieldForm({ listId, onSuccess, onClose }: AddFieldFormProps) {
  const { LL } = useI18nContext();
  const utils = trpc.useUtils();

  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');

  const createField = trpc.lists.createField.useMutation({
    onSuccess: () => {
      void utils.lists.get.invalidate(listId);
      setNewFieldName('');
      setNewFieldType('text');
      onSuccess();
    },
    onError: () => {
      addToast(LL.lists.createError(), 'error');
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const name = newFieldName.trim();
      if (!name) return;
      createField.mutate({ listId, name, fieldType: newFieldType });
    },
    [newFieldName, newFieldType, listId, createField]
  );

  return (
    <Card padding="md" className="mt-4">
      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
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
              setNewFieldName('');
              onClose();
            }}
          >
            {LL.common.cancel()}
          </Button>
        </div>
      </form>
    </Card>
  );
}
