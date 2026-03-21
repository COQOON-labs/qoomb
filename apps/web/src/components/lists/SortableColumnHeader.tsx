import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { DragHandleIcon, EllipsisVerticalIcon } from '../icons';

import type { ListField, LLType } from './types';

export interface SortableColumnHeaderProps {
  field: ListField;
  columnMenuFieldId: string | null;
  onToggleMenu: (fieldId: string) => void;
  onStartEditField: (fieldId: string) => void;
  onDeleteField: (fieldId: string) => void;
  LL: LLType;
}

export function SortableColumnHeader({
  field,
  columnMenuFieldId,
  onToggleMenu,
  onStartEditField,
  onDeleteField,
  LL,
}: SortableColumnHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap group/th relative"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="opacity-0 group-hover/th:opacity-100 cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-all shrink-0"
          aria-label="Drag to reorder column"
          {...attributes}
          {...listeners}
        >
          <DragHandleIcon className="w-3 h-3" />
        </button>
        <span className="select-none">{field.name}</span>
        <button
          type="button"
          onClick={() => onToggleMenu(field.id)}
          className="opacity-0 group-hover/th:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground transition-all"
          aria-label={LL.lists.fieldConfig()}
        >
          <EllipsisVerticalIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      {columnMenuFieldId === field.id && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-background border border-border rounded-lg shadow-lg min-w-40">
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
            onClick={() => onStartEditField(field.id)}
          >
            {LL.lists.renameField()}
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            onClick={() => {
              onToggleMenu(field.id);
              onDeleteField(field.id);
            }}
          >
            {LL.lists.removeField()}
          </button>
        </div>
      )}
    </th>
  );
}
