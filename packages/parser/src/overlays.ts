function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deterministic environment-overlay merge (§20: "Merge rules must be
 * explicit and deterministic... Document whether lists replace, append,
 * or merge by identifier"). Two rules, applied recursively:
 *
 * - Objects merge key-by-key. Since every resource collection in the
 *   schema (`models`, `tools`, `agents`, `workflows`, `memory`, `outputs`)
 *   is itself an object keyed by resource identifier, this *is*
 *   merge-by-resource-identifier — an overlay entry for an existing
 *   resource deep-merges onto it; a new key adds a new resource.
 * - Arrays **replace** the base value entirely; they never concatenate.
 *   Silently appending would make an overlay's effect depend on order and
 *   history in a way that isn't obvious from reading the overlay file
 *   alone, which fails the "explicit and deterministic" bar.
 */
export function mergeOverlay(base: unknown, overlay: unknown): unknown {
  if (overlay === undefined) {
    return base;
  }

  if (Array.isArray(overlay) || Array.isArray(base)) {
    return overlay;
  }

  if (isRecord(base) && isRecord(overlay)) {
    const merged: Record<string, unknown> = { ...base };
    for (const [key, overlayValue] of Object.entries(overlay)) {
      merged[key] = key in merged ? mergeOverlay(merged[key], overlayValue) : overlayValue;
    }
    return merged;
  }

  return overlay;
}
