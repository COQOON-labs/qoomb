import { Button, Card, Input } from '@qoomb/ui';
import { useCallback, useState } from 'react';

import { useI18nContext } from '../../i18n/i18n-react';
import { addToast } from '../../lib/toast';
import { trpc } from '../../lib/trpc/client';
import { XIcon } from '../icons';

import type { ListField } from './types';

interface FieldEditPanelProps {
  listId: string;
  field: ListField;
  onSuccess: () => void;
  onClose: () => void;
}

export function FieldEditPanel({ listId, field, onSuccess, onClose }: FieldEditPanelProps) {
  const { LL } = useI18nContext();
  const utils = trpc.useUtils();

  const [fieldDraftName, setFieldDraftName] = useState(field.name);
  const [fieldDraftOptions, setFieldDraftOptions] = useState<string[]>(() => {
    const config = field.config as Record<string, unknown> | null;
    return Array.isArray(config?.options) ? (config.options as string[]) : [];
  });
  const [newOption, setNewOption] = useState('');

  const updateField = trpc.lists.updateField.useMutation({
    onSuccess: () => {
      void utils.lists.get.invalidate(listId);
      addToast(LL.lists.fieldSaved());
      onSuccess();
    },
    onError: () => {
      addToast(LL.lists.updateError(), 'error');
    },
  });

  const handleSave = useCallback(() => {
    const trimmed = fieldDraftName.trim();
    if (!trimmed) return;
    updateField.mutate({
      id: field.id,
      listId,
      data: {
        name: trimmed,
        ...(field.fieldType === 'select' ? { config: { options: fieldDraftOptions } } : {}),
      },
    });
  }, [field, listId, fieldDraftName, fieldDraftOptions, updateField]);

  const handleAddOption = useCallback(() => {
    const trimmed = newOption.trim();
    if (!trimmed || fieldDraftOptions.includes(trimmed)) return;
    setFieldDraftOptions((prev) => [...prev, trimmed]);
    setNewOption('');
  }, [newOption, fieldDraftOptions]);

  const handleRemoveOption = useCallback((opt: string) => {
    setFieldDraftOptions((prev) => prev.filter((o) => o !== opt));
  }, []);

  return (
    <Card padding="md" className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{LL.lists.fieldConfig()}</h3>
        <button
          type="button"
          onClick={onClose}
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
            onClick={handleSave}
            disabled={!fieldDraftName.trim() || updateField.isPending}
          >
            {LL.lists.saveField()}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {LL.common.cancel()}
          </Button>
        </div>
      </div>
    </Card>
  );
}
