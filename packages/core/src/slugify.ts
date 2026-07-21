/**
 * Turns arbitrary text (e.g. a `name: "Triage Agent"` string recovered by
 * `agentform import`'s heuristic source scanning) into a valid Agentform
 * identifier (`@agentform/schema`'s `identifierSchema`:
 * `^[a-zA-Z][a-zA-Z0-9_-]*$`). Falls back to `fallback` (itself assumed
 * already valid) when nothing alphanumeric survives.
 */
export function slugifyIdentifier(text: string, fallback: string): string {
  const slug = text
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (slug.length === 0) {
    return fallback;
  }
  return /^[a-zA-Z]/.test(slug) ? slug : `a_${slug}`;
}
