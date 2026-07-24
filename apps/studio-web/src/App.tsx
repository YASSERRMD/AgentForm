import type { SpecDocumentResponse } from '@agentform/studio-core';
import { useEffect, useState } from 'react';
import { getSpec } from './api/client';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { SpecViewer } from './components/SpecViewer';

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly document: SpecDocumentResponse }
  | { readonly status: 'error'; readonly message: string };

export function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getSpec()
      .then((document) => {
        if (!cancelled) {
          setState({ status: 'loaded', document });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return <p>Loading spec…</p>;
  }

  if (state.status === 'error') {
    return <p role="alert">Failed to load spec: {state.message}</p>;
  }

  return (
    <main>
      <h1>Agentform Studio</h1>
      {state.document.application && <SpecViewer application={state.document.application} />}
      <DiagnosticsPanel diagnostics={state.document.diagnostics} />
    </main>
  );
}
