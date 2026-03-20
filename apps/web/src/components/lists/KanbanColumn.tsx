import { useDroppable } from '@dnd-kit/core';

import { KanbanCard } from './KanbanCard';
import type { ListItem, LLType } from './types';

export interface KanbanColumnProps {
  columnId: string;
  label: string;
  items: ListItem[];
  titleFieldId: string | null;
  handleDeleteItem: (id: string) => void;
  LL: LLType;
}

export function KanbanColumn({
  columnId,
  label,
  items,
  titleFieldId,
  handleDeleteItem,
  LL,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[220px] max-w-[220px] rounded-xl border transition-colors ${
        isOver ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/20'
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-sm font-semibold text-foreground truncate">{label}</span>
        <span className="ml-2 text-xs text-muted-foreground flex-shrink-0">{items.length}</span>
      </div>
      {/* Cards */}
      <div className="flex flex-col gap-2 p-2.5 min-h-[80px]">
        {items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            titleFieldId={titleFieldId}
            handleDeleteItem={handleDeleteItem}
            LL={LL}
          />
        ))}
      </div>
    </div>
  );
}
