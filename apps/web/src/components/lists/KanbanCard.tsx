import { useDraggable } from '@dnd-kit/core';

import { TrashIcon } from '../icons';

import type { ListItem, LLType } from './types';

export interface KanbanCardProps {
  item: ListItem;
  titleFieldId: string | null;
  handleDeleteItem: (id: string) => void;
  LL: LLType;
}

export function KanbanCard({ item, titleFieldId, handleDeleteItem, LL }: KanbanCardProps) {
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
          className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-2 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteItem(item.id);
          }}
          aria-label={LL.lists.deleteItem()}
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
