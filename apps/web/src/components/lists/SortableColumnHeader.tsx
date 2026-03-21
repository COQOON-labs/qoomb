import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { DragHandleIcon } from '../icons';

import type { ListField } from './types';

export interface SortableColumnHeaderProps {
  field: ListField;
}

export function SortableColumnHeader({ field }: SortableColumnHeaderProps) {
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
      <span className="select-none">{field.name}</span>
      {/* Drag handle shifted into the preceding empty drag column so it never overlaps header text */}
      <button
        type="button"
        className="absolute -left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/th:opacity-100 cursor-grab active:cursor-grabbing p-1.5 text-muted-foreground/50 hover:text-muted-foreground transition-all"
        aria-label="Drag to reorder column"
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon className="w-3 h-3" />
      </button>
    </th>
  );
}
