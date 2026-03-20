import { useCallback, useEffect, useRef, useState } from 'react';

import { UserIcon, XIcon } from '../icons';

import { parsePersonValues, serializePersonValues } from './personField.utils';

interface Person {
  id: string;
  displayName: string | null;
}

interface PersonCellPickerProps {
  /** Raw stored value — JSON array string, plain UUID, or free text */
  initialValue: string;
  persons: readonly Person[];
  /** Called with the serialised value string, or null when empty */
  onSave: (value: string | null) => void;
  onClose: () => void;
}

/**
 * Inline picker for person-type list fields.
 *
 * Features:
 *  - Multi-select checkboxes for hive members
 *  - Free-text entry for external / non-member names
 *  - Click-outside → auto-saves and closes
 *  - Esc / "Fertig" button → explicit save + close
 */
export function PersonCellPicker({
  initialValue,
  persons,
  onSave,
  onClose,
}: PersonCellPickerProps) {
  const [selected, setSelected] = useState<string[]>(() => parsePersonValues(initialValue));
  const [freeText, setFreeText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep a ref so the outside-click handler always reads the fresh selection
  // without needing to be re-registered on every state change.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  function commit(values: string[]) {
    onSave(serializePersonValues(values));
    onClose();
  }

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        commit(selectedRef.current);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function remove(v: string) {
    setSelected((prev) => prev.filter((x) => x !== v));
  }

  const handleAddFreeText = useCallback(() => {
    const trimmed = freeText.trim();
    if (trimmed && !selected.includes(trimmed)) {
      setSelected((prev) => [...prev, trimmed]);
    }
    setFreeText('');
  }, [freeText, selected]);

  const handleFreeTextKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddFreeText();
      }
      if (e.key === 'Escape') commit(selectedRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleAddFreeText]
  );

  const handleCommitClick = useCallback(() => {
    commit(selectedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function label(v: string) {
    return persons.find((p) => p.id === v)?.displayName ?? v;
  }

  return (
    <div ref={containerRef} className="relative">
      {/* ── Current selections as chips ───────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 min-h-[1.5rem]">
        {selected.length === 0 ? (
          <span className="text-muted-foreground/40 text-xs italic">—</span>
        ) : (
          selected.map((v) => {
            const isPerson = persons.some((p) => p.id === v);
            return isPerson ? (
              // Resolved hive member: primary badge + UserIcon (2 cues)
              <span
                key={v}
                className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-foreground font-medium"
              >
                <UserIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
                {label(v)}
                <button
                  type="button"
                  onClick={() => remove(v)}
                  className="ml-0.5 leading-none hover:text-destructive"
                  aria-label={`Remove ${label(v)}`}
                >
                  <XIcon className="w-2.5 h-2.5" />
                </button>
              </span>
            ) : (
              // Free-text external name: dashed border + no icon + italic (3 cues)
              <span
                key={v}
                className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground italic"
                title="Nicht im System"
              >
                {label(v)}
                <button
                  type="button"
                  onClick={() => remove(v)}
                  className="ml-0.5 leading-none hover:text-destructive"
                  aria-label={`Remove ${label(v)}`}
                >
                  <XIcon className="w-2.5 h-2.5" />
                </button>
              </span>
            );
          })
        )}
      </div>

      {/* ── Dropdown panel ────────────────────────────────────────────────── */}
      <div className="absolute z-50 top-full left-0 mt-1 w-52 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
        {persons.length > 0 && (
          <div className="max-h-40 overflow-y-auto">
            {persons.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 cursor-pointer text-sm select-none"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={() => toggle(p.id)}
                  className="accent-primary shrink-0"
                />
                {p.displayName ?? p.id}
              </label>
            ))}
          </div>
        )}

        {/* ── Free-text entry ───────────────────────────────────────────── */}
        <div className="border-t border-border px-2 py-1.5 flex gap-1.5 items-center">
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={handleFreeTextKeyDown}
            placeholder="Freitext…"
            className="flex-1 text-xs bg-transparent outline-none border-b border-border/60 py-0.5 placeholder:text-muted-foreground/40"
          />
          <button
            type="button"
            onClick={handleAddFreeText}
            disabled={!freeText.trim()}
            className="text-sm font-bold text-primary disabled:opacity-30 hover:opacity-70"
            aria-label="Add free text entry"
          >
            +
          </button>
        </div>

        <div className="px-2 pb-2 pt-1">
          <button
            type="button"
            onClick={handleCommitClick}
            className="w-full text-xs bg-primary text-background font-semibold rounded-md py-1 hover:opacity-90"
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
}
