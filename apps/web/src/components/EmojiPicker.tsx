/**
 * EmojiPicker
 *
 * A reusable floating emoji picker backed by @emoji-mart/react.
 * Renders a <Picker> with the full Unicode dataset and built-in search.
 * Closes automatically when the user clicks outside or presses Escape.
 *
 * Usage:
 *   <EmojiPicker
 *     open={showPicker}
 *     onSelect={(emoji) => handleIconSelect(emoji)}
 *     onClose={() => setShowPicker(false)}
 *     locale={locale}     // 'de' | 'en'
 *   />
 *
 * Positioning: the picker is rendered absolutely relative to the nearest
 * positioned ancestor. Wrap the trigger + picker in `<div className="relative">`.
 */
import baseData from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { useEffect, useRef, useState } from 'react';

import { getAugmentedEmojiData } from '../lib/emojiAugmentation';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Subset of the emoji-mart EmojiClickData we actually need. */
interface EmojiData {
  /** The native unicode emoji string, e.g. "🎯" */
  native: string;
}

export interface EmojiPickerProps {
  /** Whether the picker is visible */
  open: boolean;
  /**
   * Called when the user selects an emoji.
   * Receives the native unicode character.
   */
  onSelect: (emoji: string) => void;
  /** Called when the picker should close (outside click or Escape) */
  onClose: () => void;
  /**
   * UI locale for category labels and search keywords.
   * Supports 'de' and 'en'; falls back to 'en' for anything else.
   */
  locale?: string;
  /** Additional CSS classes on the wrapper div */
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EmojiPicker({ open, onSelect, onClose, locale, className = '' }: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // emoji-mart supports 'de' and 'en' natively; normalise anything else to 'en'
  const pickerLocale = locale === 'de' ? 'de' : 'en';

  // Start with English base data; swap out for augmented data once loaded.
  // This keeps the picker usable instantly while German keywords load silently.
  const [pickerData, setPickerData] = useState<object>(baseData as object);

  useEffect(() => {
    void getAugmentedEmojiData(pickerLocale).then((augmented) => {
      setPickerData(augmented);
      return augmented;
    });
  }, [pickerLocale]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={containerRef} className={`absolute top-full left-0 mt-1 z-50 ${className}`}>
      <Picker
        data={pickerData as never}
        locale={pickerLocale}
        onEmojiSelect={(emoji: EmojiData) => {
          onSelect(emoji.native);
          onClose();
        }}
        // Styling tweaks to match the app theme
        theme="auto"
        previewPosition="none"
        skinTonePosition="none"
      />
    </div>
  );
}
