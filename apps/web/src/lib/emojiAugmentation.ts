/**
 * emojiAugmentation
 *
 * Augments the @emoji-mart/data dataset with translated keywords from
 * emojibase-data so that users can search in their own language as well as
 * English.
 *
 * Strategy:
 *   1. Load the base @emoji-mart/data (English keywords, already bundled).
 *   2. Lazily load the locale-specific emojibase-data JSON (Vite code-split).
 *   3. Match emojis by unicode codepoint (emoji-mart `unified` ↔ emojibase
 *      `hexcode`, both normalised to lowercase).
 *   4. Append translated label + tags to each emoji's keywords array.
 *   5. Cache the result per locale; subsequent calls are synchronous.
 *
 * Supporting a new locale = install emojibase-data (already a dep) and add
 * a branch in loadLocaleEntries() below.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmojibaseEntry {
  hexcode: string;
  label?: string;
  tags?: string[];
}

// Minimal subset we need from @emoji-mart/data
interface EmojiMartEmoji {
  keywords: string[];
  skins?: Array<{ unified: string }>;
}

interface EmojiMartData {
  emojis: Record<string, EmojiMartEmoji>;
  // other fields (categories, aliases, …) pass through unchanged
  [key: string]: unknown;
}

// ── Locale loader (extend here for more locales) ──────────────────────────────

async function loadLocaleEntries(locale: string): Promise<EmojibaseEntry[] | null> {
  try {
    switch (locale) {
      case 'de': {
        const mod = await import('emojibase-data/de/data.json');
        return (mod.default ?? mod) as EmojibaseEntry[];
      }
      // Add more locales here as needed, e.g.:
      // case 'fr': { const mod = await import('emojibase-data/fr/data.json'); … }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ── Cache ─────────────────────────────────────────────────────────────────────

// Holds the augmented data promise per locale so we never augment twice
const _cache = new Map<string, Promise<EmojiMartData>>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns emoji-mart data augmented with translated keywords for `locale`.
 *
 * For 'en' (or any locale without a loader) this returns the base data
 * unchanged. The Promise resolves quickly (<100 ms on first call).
 *
 * @param locale  BCP-47 language tag, e.g. 'de' or 'en'
 */
export function getAugmentedEmojiData(locale: string): Promise<EmojiMartData> {
  const normalised = locale.split('-')[0].toLowerCase(); // 'de-CH' → 'de'

  const cached = _cache.get(normalised);
  if (cached) return cached;

  const work = _augment(normalised);
  _cache.set(normalised, work);
  return work;
}

async function _augment(locale: string): Promise<EmojiMartData> {
  const [{ default: baseData }, localeEntries] = await Promise.all([
    import('@emoji-mart/data'),
    loadLocaleEntries(locale),
  ]);

  const base = baseData as EmojiMartData;

  if (!localeEntries || localeEntries.length === 0) return base;

  // Build hexcode → translated keywords map (lowercase keys)
  const extra = new Map<string, string[]>();
  for (const entry of localeEntries) {
    const key = entry.hexcode.toLowerCase();
    const kw: string[] = [];
    if (entry.label) kw.push(entry.label.toLowerCase());
    for (const tag of entry.tags ?? []) kw.push(tag.toLowerCase());
    if (kw.length > 0) extra.set(key, kw);
  }

  // Build augmented emojis — only allocate new objects for emojis that gain keywords
  const augmentedEmojis: Record<string, EmojiMartEmoji> = {};
  for (const [id, emoji] of Object.entries(base.emojis)) {
    const unified = emoji.skins?.[0]?.unified;
    if (!unified) {
      augmentedEmojis[id] = emoji;
      continue;
    }
    const translated = extra.get(unified);
    if (!translated) {
      augmentedEmojis[id] = emoji;
      continue;
    }
    augmentedEmojis[id] = {
      ...emoji,
      keywords: [...new Set([...emoji.keywords, ...translated])],
    };
  }

  return { ...base, emojis: augmentedEmojis };
}
