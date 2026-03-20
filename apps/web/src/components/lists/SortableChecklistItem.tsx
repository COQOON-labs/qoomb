import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useState } from 'react';

import { CheckIcon, DragHandleIcon, TrashIcon } from '../icons';

import type { ListItem, UpdateItemMutation, CreateItemMutation, LLType } from './types';

// ── Recurrence constants ──────────────────────────────────────────────────────

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

// ── Component ─────────────────────────────────────────────────────────────────

export interface SortableChecklistItemProps {
  item: ListItem;
  isDone: boolean;
  title: string;
  isLast: boolean;
  checkboxFieldId: string;
  listId: string;
  updateItem: UpdateItemMutation;
  createItem: CreateItemMutation;
  handleDeleteItem: (id: string) => void;
  LL: LLType;
}

export function SortableChecklistItem({
  item,
  isDone,
  title,
  isLast,
  checkboxFieldId,
  listId,
  updateItem,
  createItem,
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

  const [showRecurrence, setShowRecurrence] = useState(false);
  const recRule = item.recurrenceRule as {
    frequency?: RecurrenceFrequency;
    interval?: number;
  } | null;

  const handleToggleDone = useCallback(() => {
    const newVal = !isDone;
    updateItem.mutate({ id: item.id, data: { values: { [checkboxFieldId]: newVal } } });
    // Client-side recurrence expansion: when a recurring item is completed,
    // spawn a fresh copy (unchecked) so the next occurrence appears immediately.
    if (newVal && recRule?.frequency) {
      const nextValues: Record<string, string | number | boolean | null> = {};
      for (const v of item.values) {
        if (v.fieldId === checkboxFieldId) {
          nextValues[v.fieldId] = false;
        } else if (v.value !== null && v.value !== undefined) {
          nextValues[v.fieldId] = v.value;
        }
      }
      createItem.mutate({
        listId,
        values: nextValues,
        recurrenceRule: { frequency: recRule.frequency, interval: recRule.interval },
      });
    }
  }, [isDone, item, checkboxFieldId, recRule, updateItem, createItem, listId]);

  const handleRecurrenceChange = useCallback(
    (frequency: RecurrenceFrequency | '') => {
      const rule = frequency ? { frequency } : null;
      updateItem.mutate({ id: item.id, data: { recurrenceRule: rule } });
      setShowRecurrence(false);
    },
    [item.id, updateItem]
  );

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`px-4 py-3 group hover:bg-muted/20 ${!isLast ? 'border-b border-border' : ''}`}
    >
      <div className="flex items-center gap-3">
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
          onClick={handleToggleDone}
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
        {/* Recurrence indicator */}
        {recRule?.frequency && (
          <span className="text-xs text-muted-foreground flex-shrink-0">🔁</span>
        )}
        {/* Recurrence picker toggle */}
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex-shrink-0"
          onClick={() => setShowRecurrence((p) => !p)}
          aria-label={LL.lists.recurrenceLabel()}
        >
          <span className="text-xs">🔁</span>
        </button>
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
          onClick={() => handleDeleteItem(item.id)}
          aria-label={LL.lists.deleteItem()}
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Recurrence picker */}
      {showRecurrence && (
        <div className="mt-2 ml-14 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => handleRecurrenceChange('')}
            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
              !recRule?.frequency
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {LL.lists.recurrenceNone()}
          </button>
          {RECURRENCE_FREQUENCIES.map((freq) => (
            <button
              key={freq}
              type="button"
              onClick={() => handleRecurrenceChange(freq)}
              className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                recRule?.frequency === freq
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {LL.lists.recurrenceFrequency[freq]()}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
