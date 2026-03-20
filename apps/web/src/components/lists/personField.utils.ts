/**
 * Person field value parsing.
 *
 * Person fields store either:
 *   - a plain UUID / free-text string  (legacy / single value)
 *   - a JSON array string: '["uuid1","Free Text"]'  (multi-value)
 *
 * Always returns an array of strings so callers don't need to branch.
 *
 * Single-value serialisation:  values[0]              (plain string, backward compat)
 * Multi-value serialisation:   JSON.stringify(values) (JSON array)
 */
export function parsePersonValues(val: string): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val) as unknown;
    if (Array.isArray(parsed)) {
      return (parsed as unknown[]).filter((x): x is string => typeof x === 'string');
    }
  } catch {
    // not JSON — treat as a single plain string
  }
  return [val];
}

/** Serialise an array of person values back to the storage string. */
export function serializePersonValues(values: string[]): string | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0]; // keep backward compat: single = plain string
  return JSON.stringify(values);
}
