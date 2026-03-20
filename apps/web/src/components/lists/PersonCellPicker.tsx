import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
 * Inline person picker with Notion-style search autocomplete.
 *
 * Features:
 *  - Chips + search input combined in one field
 *  - Filtered dropdown of hive members as you type
 *  - "Add free text" option when query has no exact member match
 *  - Keyboard: ArrowUp/Down, Enter to select, Backspace removes last chip, Esc commits
 *  - Click-outside → auto-saves and closes
 */
export function PersonCellPicker({
  initialValue,
  persons,
  onSave,
  onClose,
}: PersonCellPickerProps) {
  const [selected, setSelected] = useState<string[]>(() => parsePersonValues(initialValue));
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep a ref so the outside-click handler always reads the fresh selection
  // without needing to be re-registered on every state change.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Focus the input immediately on mount so the user can start typing
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  // Persons not yet selected, filtered by current query
  const suggestions = useMemo(() => {
    const q = query.toLowerCase().trim();
    const available = persons.filter((p) => !selected.includes(p.id));
    if (!q) return available;
    return available.filter((p) => (p.displayName ?? '').toLowerCase().includes(q));
  }, [query, persons, selected]);

  // Show a "add free text" row when the query doesn't match any member exactly
  const showFreeTextOption = useMemo(() => {
    const t = query.trim();
    if (!t || selected.includes(t)) return false;
    return !persons.some((p) => (p.displayName ?? '').toLowerCase() === t.toLowerCase());
  }, [query, persons, selected]);

  const totalOptions = suggestions.length + (showFreeTextOption ? 1 : 0);

  // Reset keyboard highlight whenever the list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [suggestions.length, query]);

  // Stable remove handler via data-value attribute — avoids jsx-no-bind warning
  const handleRemove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const v = e.currentTarget.dataset.value;
    if (v !== undefined) setSelected((prev) => prev.filter((x) => x !== v));
  }, []);

  // Stable suggestion-click handler via data-id attribute
  const handlePersonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const handleFreeTextClick = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed && !selectedRef.current.includes(trimmed)) {
      setSelected((prev) => [...prev, trimmed]);
    }
    setQuery('');
    inputRef.current?.focus();
  }, [query]);

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        commit(selectedRef.current);
        return;
      }
      if (e.key === 'Backspace' && query === '') {
        setSelected((prev) => prev.slice(0, -1));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, totalOptions - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex < suggestions.length) {
          const id = suggestions[highlightedIndex].id;
          setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
          setQuery('');
        } else if (showFreeTextOption) {
          const trimmed = query.trim();
          if (trimmed) {
            setSelected((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
            setQuery('');
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, suggestions, highlightedIndex, totalOptions, showFreeTextOption]
  );

  function label(v: string) {
    return persons.find((p) => p.id === v)?.displayName ?? v;
  }

  return (
    <div ref={containerRef} className="relative">
      {/* ── Chips + search input (Notion-style combined field) ─────────────── */}
      <div className="flex flex-wrap gap-1 items-center min-h-[1.75rem] rounded-md border border-primary/50 bg-background px-1.5 py-1 focus-within:ring-1 focus-within:ring-primary/50">
        {selected.map((v) => {
          const isResolved = persons.some((p) => p.id === v);
          return isResolved ? (
            // Resolved hive member: filled primary badge + UserIcon (2 cues)
            <span
              key={v}
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-foreground font-medium"
            >
              <UserIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
              {label(v)}
              <button
                type="button"
                data-value={v}
                onClick={handleRemove}
                className="ml-0.5 leading-none hover:text-destructive"
                aria-label={`${label(v)} entfernen`}
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </span>
          ) : (
            // Free-text external name: dashed border + italic + no icon (3 cues)
            <span
              key={v}
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground italic"
              title="Nicht im System"
            >
              {label(v)}
              <button
                type="button"
                data-value={v}
                onClick={handleRemove}
                className="ml-0.5 leading-none hover:text-destructive"
                aria-label={`${label(v)} entfernen`}
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? 'Person suchen…' : ''}
          className="min-w-[5rem] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
          aria-label="Person suchen"
          aria-autocomplete="list"
        />
      </div>

      {/* ── Autocomplete dropdown ──────────────────────────────────────────── */}
      {totalOptions > 0 && (
        <div
          role="listbox"
          className="absolute z-50 top-full left-0 mt-1 w-56 bg-background border border-border rounded-lg shadow-lg overflow-hidden"
        >
          {suggestions.length > 0 && (
            <div className="max-h-44 overflow-y-auto py-1">
              {suggestions.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={i === highlightedIndex}
                  data-id={p.id}
                  onClick={handlePersonClick}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                    i === highlightedIndex ? 'bg-muted/50' : 'hover:bg-muted/30'
                  }`}
                >
                  <UserIcon
                    className="w-3.5 h-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {p.displayName ?? p.id}
                </button>
              ))}
            </div>
          )}

          {/* Free-text add row — shown when query doesn't match any member */}
          {showFreeTextOption && (
            <div className={suggestions.length > 0 ? 'border-t border-border' : ''}>
              <button
                type="button"
                onClick={handleFreeTextClick}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                  highlightedIndex === suggestions.length ? 'bg-muted/50' : 'hover:bg-muted/30'
                }`}
              >
                <span className="text-base font-bold leading-none text-primary">+</span>
                <span className="italic text-muted-foreground">
                  &ldquo;{query.trim()}&rdquo; hinzufügen
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
