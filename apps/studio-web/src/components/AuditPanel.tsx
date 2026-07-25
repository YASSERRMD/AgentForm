import type { AuditEntry } from '@agentform/studio-core';
import { useEffect, useState } from 'react';
import { getAudit } from '../api/client';

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly entries: readonly AuditEntry[] }
  | { readonly status: 'error'; readonly message: string };

function describeTarget(target: AuditEntry['target']): string {
  return target.kind === 'spec' ? 'spec' : `design: ${target.resourceType}.${target.resourceId}`;
}

/**
 * Read-only view of Studio's local, append-only provenance log (Phase
 * 18) — `GET /api/audit`, newest first. Manual refresh rather than
 * auto-refreshing on every mutation elsewhere in the app: design saves
 * (`FormLayoutEditor`) don't share `App`'s own `load()` reload cadence,
 * and wiring a cross-panel "something changed" event for a small
 * recent-changes list isn't worth the plumbing.
 */
export function AuditPanel() {
  const [state, setState] = useState<State>({ status: 'loading' });

  function fetchEntries() {
    getAudit()
      .then((response) => setState({ status: 'loaded', entries: response.entries }))
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }

  // The effect body itself stays free of a synchronous setState (state
  // already starts as 'loading') — only fetchEntries' own .then/.catch
  // ever call it, same pattern FormLayoutEditor's design-load effect
  // uses; react-hooks/set-state-in-effect flags the alternative.
  useEffect(() => {
    fetchEntries();
  }, []);

  function handleRefresh() {
    setState({ status: 'loading' });
    fetchEntries();
  }

  const busy = state.status === 'loading';

  return (
    <section aria-label="Recent changes">
      <h3>Recent changes</h3>
      <button type="button" onClick={handleRefresh} disabled={busy}>
        {busy ? 'Refreshing…' : 'Refresh'}
      </button>
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'loaded' &&
        (state.entries.length === 0 ? (
          <p>No changes yet.</p>
        ) : (
          <ul aria-label="Audit entries">
            {state.entries.map((entry, index) => (
              <li key={`${entry.timestamp}-${index}`}>
                <span>{new Date(entry.timestamp).toLocaleString()}</span>{' '}
                <strong>{entry.source}</strong> <span>{describeTarget(entry.target)}</span>{' '}
                <span>{entry.summary}</span>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
