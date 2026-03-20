import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useI18nContext } from '../../i18n/i18n-react';
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
 * ARIA: implements WAI-ARIA 1.2 combobox + listbox pattern (multi-select).
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
  const { LL } = useI18nContext();

  // ── Callback refs: always call the current onSave/onClose, regardless of
  // when a closure was created. Prevents stale-closure bugs when the parent
  // passes inline arrow functions (which are recreated on every render).
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Fresh selected state for event handlers that can't be cheaply recreated
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Stable ARIA IDs per component instance (React useId — survives re-renders)
  const pickerId = useId();
  const listboxId = `${pickerId}lb`;
  const freeTextOptionId = `${pickerId}oft`;
  const toOptionId = (key: string) => `${pickerId}o${key.replace(/\W/g, '_')}`;

  // Focus the input immediately on mount so the user can start typing
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Stable commit — only reads from refs, zero stale-closure risk.
  // Can be listed as a dep without causing re-registration of effects.
  const commit = useCallback((values: string[]) => {
    onSaveRef.current(serializePersonValues(values));
    onCloseRef.current();
  }, []);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        commit(selectedRef.current);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [commit]);

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

  // Reset keyboard highlight whenever the suggestion list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [suggestions.length, query]);

  // aria-activedescendant: points to the keyboard-highlighted option's id.
  // Distinct from aria-selected (which means "currently chosen", not "focused").
  const activeDescendant =
    totalOptions === 0
      ? undefined
      : highlightedIndex < suggestions.length
        ? toOptionId(suggestions[highlightedIndex].id)
        : showFreeTextOption
          ? freeTextOptionId
          : undefined;

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
    [commit, query, suggestions, highlightedIndex, totalOptions, showFreeTextOption]
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
                aria-label={LL.lists.personRemove({ name: label(v) })}
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </span>
          ) : (
            // Free-text external name: dashed border + italic + no icon (3 cues)
            <span
              key={v}
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground italic"
              title={LL.lists.personExternal()}
            >
              {label(v)}
              <button
                type="button"
                data-value={v}
                onClick={handleRemove}
                className="ml-0.5 leading-none hover:text-destructive"
                aria-label={LL.lists.personRemove({ name: label(v) })}
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </span>
          );
        })}
        {/* WAI-ARIA 1.2 combobox pattern — role="combobox" on the input itself */}
        <input
          ref={inputRef}
          role="combobox"
          type="text"
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? LL.lists.personSearch() : ''}
          className="min-w-[5rem] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
          maxLength={500}
          aria-label={LL.lists.personSearchLabel()}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={totalOptions > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
        />
      </div>

      {/* ── Autocomplete dropdown ──────────────────────────────────────────── */}
      {totalOptions > 0 && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={LL.lists.personPickerLabel()}
          aria-multiselectable="true"
          className="absolute z-50 top-full left-0 mt-1 w-56 bg-background border border-border rounded-lg shadow-lg overflow-hidden"
        >
          {suggestions.length > 0 && (
            <div className="max-h-44 overflow-y-auto py-1">
              {suggestions.map((p, i) => (
                <button
                  key={p.id}
                  id={toOptionId(p.id)}
                  type="button"
                  role="option"
                  aria-selected={false}
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
                id={freeTextOptionId}
                type="button"
                role="option"
                aria-selected={false}
                onClick={handleFreeTextClick}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                  highlightedIndex === suggestions.length ? 'bg-muted/50' : 'hover:bg-muted/30'
                }`}
              >
                <span className="text-base font-bold leading-none text-primary">+</span>
                <span className="italic text-muted-foreground">
                  {LL.lists.personAddFreeText({ name: query.trim() })}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
