const TOKEN_QUERY_PARAM = 'token';
const TOKEN_STORAGE_KEY = 'agentform-studio-token';

/**
 * Bootstraps a Studio access token (ADR-0022) from the URL Studio's own
 * startup log prints (`?token=...`), stores it for the rest of the tab's
 * session, then strips it from the visible URL — a token must never
 * linger in browser history or be re-sent as a query param on every
 * subsequent request (the server's own `logger: true` would log it).
 * Call once, at module load. Falls back to any previously-stored value
 * on a plain refresh, when the URL no longer carries the param.
 */
export function initStudioToken(): void {
  const url = new URL(window.location.href);
  const tokenFromUrl = url.searchParams.get(TOKEN_QUERY_PARAM);
  if (!tokenFromUrl) {
    return;
  }
  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, tokenFromUrl);
  url.searchParams.delete(TOKEN_QUERY_PARAM);
  window.history.replaceState(null, '', url.toString());
}

/** `undefined` when no token was ever bootstrapped — Studio's zero-config default (see client.ts, which omits the header entirely in that case). */
export function getStoredStudioToken(): string | undefined {
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? undefined;
}
