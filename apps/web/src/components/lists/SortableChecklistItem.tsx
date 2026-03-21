import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useRef, useState } from 'react';

import { CheckIcon, DragHandleIcon, TrashIcon } from '../icons';

import type { ListItem, UpdateItemMutation, LLType } from './types';

// ── Component ─────────────────────────────────────────────────────────────────

export interface ChecklistExtraField {
  name: string;
  value: string;
}

export interface SortableChecklistItemProps {
  item: ListItem;
  isDone: boolean;
  title: string;
  titleFieldId: string | null;
  isLast: boolean;
  checkboxFieldId: string;
  extraFields?: ChecklistExtraField[];
  updateItem: UpdateItemMutation;
  handleDeleteItem: (id: string) => void;
  LL: LLType;
}

export function SortableChecklistItem({
  item,
  isDone,
  title,
  titleFieldId,
  isLast,
  checkboxFieldId,
  extraFields,
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

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleTitleClick = useCallback(() => {
    if (!titleFieldId) return;
    setTitleDraft(title);
    setEditingTitle(true);
    // Focus after paint
    setTimeout(() => titleInputRef.current?.select(), 0);
  }, [title, titleFieldId]);

  const handleTitleSave = useCallback(() => {
    setEditingTitle(false);
    if (!titleFieldId || titleDraft === title) return;
    updateItem.mutate({ id: item.id, data: { values: { [titleFieldId]: titleDraft } } });
  }, [titleFieldId, titleDraft, title, item.id, updateItem]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleTitleSave();
      if (e.key === 'Escape') setEditingTitle(false);
    },
    [handleTitleSave]
  );
  const handleToggleDone = useCallback(() => {
    const newVal = !isDone;
    updateItem.mutate({ id: item.id, data: { values: { [checkboxFieldId]: newVal } } });
  }, [isDone, item.id, checkboxFieldId, updateItem]);

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
        <div className="flex-1 min-w-0">
          {editingTitle && titleFieldId ? (
            <input
              ref={titleInputRef}
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              aria-label={LL.lists.editItemTitle()}
              className="w-full text-sm bg-transparent border-b border-primary outline-none text-foreground"
            />
          ) : (
            <span
              role={titleFieldId ? 'button' : undefined}
              tabIndex={titleFieldId ? 0 : undefined}
              onClick={handleTitleClick}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleClick()}
              className={`text-sm block ${
                isDone ? 'line-through text-muted-foreground' : 'text-foreground'
              } ${titleFieldId ? 'cursor-text hover:text-primary transition-colors' : ''}`}
            >
              {title || <span className="text-muted-foreground/40">—</span>}
            </span>
          )}
          {extraFields && extraFields.length > 0 && (
            <div
              className="grid gap-x-4 gap-y-0 mt-0.5"
              style={{
                gridTemplateColumns: `repeat(${extraFields.length}, minmax(0, 1fr))`,
              }}
            >
              {extraFields.map((ef) => (
                <span key={ef.name} className="text-xs text-muted-foreground truncate">
                  <span className="opacity-50">{ef.name}:</span> {ef.value || '—'}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
          onClick={() => handleDeleteItem(item.id)}
          aria-label={LL.lists.deleteItem()}
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}
