import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { DragHandleIcon, TrashIcon } from '../icons';

import type { ListField, ListItem, UpdateItemMutation, LLType } from './types';

export interface SortableTableRowProps {
  item: ListItem;
  fields: ListField[];
  editingCell: { itemId: string; fieldId: string } | null;
  cellDraft: string;
  cellInputRef: React.RefObject<HTMLInputElement | null>;
  getItemValue: (item: ListItem, fieldId: string, fieldType: string) => string;
  handleCellClick: (itemId: string, fieldId: string, fieldType: string, value: string) => void;
  handleCellSave: () => void;
  handleCellKeyDown: (e: React.KeyboardEvent) => void;
  handleDeleteItem: (id: string) => void;
  setCellDraft: (v: string) => void;
  updateItem: UpdateItemMutation;
  LL: LLType;
}

export function SortableTableRow({
  item,
  fields,
  editingCell,
  cellDraft,
  cellInputRef,
  getItemValue,
  handleCellClick,
  handleCellSave,
  handleCellKeyDown,
  handleDeleteItem,
  setCellDraft,
  updateItem,
  LL,
}: SortableTableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-border last:border-0 hover:bg-muted/20 group"
    >
      {fields.map((field) => {
        const cellValue = getItemValue(item, field.id, field.fieldType);
        const isEditing = editingCell?.itemId === item.id && editingCell?.fieldId === field.id;
        return (
          <td
            key={field.id}
            className="px-3 py-2.5 text-foreground cursor-pointer"
            onClick={() => {
              if (!isEditing) {
                handleCellClick(item.id, field.id, field.fieldType, cellValue);
              }
            }}
          >
            {isEditing ? (
              field.fieldType === 'select' ? (
                <select
                  value={cellDraft}
                  onChange={(e) => {
                    setCellDraft(e.target.value);
                    const val = e.target.value || null;
                    updateItem.mutate({ id: item.id, data: { values: { [field.id]: val } } });
                  }}
                  className="w-full bg-transparent text-sm text-foreground border-b border-primary outline-none"
                >
                  <option value="">{LL.lists.selectPlaceholder()}</option>
                  {(
                    (field.config as Record<string, unknown> | null)?.options as
                      | string[]
                      | undefined
                  )?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  ref={cellInputRef}
                  type={
                    field.fieldType === 'number'
                      ? 'number'
                      : field.fieldType === 'date'
                        ? 'date'
                        : 'text'
                  }
                  value={cellDraft}
                  onChange={(e) => setCellDraft(e.target.value)}
                  onBlur={handleCellSave}
                  onKeyDown={handleCellKeyDown}
                  className="w-full bg-transparent text-sm text-foreground border-b border-primary outline-none"
                />
              )
            ) : (
              cellValue || <span className="text-muted-foreground/30">—</span>
            )}
          </td>
        );
      })}
      <td className="px-2 py-2.5">
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
          onClick={() => handleDeleteItem(item.id)}
          aria-label={LL.lists.deleteItem()}
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </td>
      {/* drag handle */}
      <td className="w-6 px-1 py-2.5">
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground transition-all touch-none"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <DragHandleIcon className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}
