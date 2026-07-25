import type {
  ResourceFormSchema,
  ResourceType,
  SpecDocumentResponse,
} from '@agentform/studio-core';
import { useEffect, useState } from 'react';
import { getFormSchemas, getSpec } from './api/client';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { GenerateSpecPanel } from './components/GenerateSpecPanel';
import { ResourceEditor } from './components/ResourceEditor';
import { SpecViewer } from './components/SpecViewer';

type LoadState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'loaded';
      readonly document: SpecDocumentResponse;
      readonly formSchemas: Record<ResourceType, ResourceFormSchema>;
    }
  | { readonly status: 'error'; readonly message: string };

interface EditingTarget {
  readonly resourceType: ResourceType;
  readonly resourceId: string;
}

function resourceValue(document: SpecDocumentResponse, target: EditingTarget): unknown {
  const spec = document.application?.spec;
  if (!spec) {
    return undefined;
  }
  const collection = (spec[target.resourceType] ?? {}) as Record<string, unknown>;
  return collection[target.resourceId];
}

export function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [editing, setEditing] = useState<EditingTarget | undefined>(undefined);

  function load() {
    Promise.all([getSpec(), getFormSchemas()])
      .then(([document, formSchemas]) => {
        setState({ status: 'loaded', document, formSchemas });
      })
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }

  useEffect(() => {
    load();
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
      <GenerateSpecPanel application={state.document.application} onApplied={load} />
      {state.document.application && (
        <SpecViewer
          application={state.document.application}
          onEditResource={(resourceType, resourceId) => setEditing({ resourceType, resourceId })}
        />
      )}
      <DiagnosticsPanel diagnostics={state.document.diagnostics} />
      {editing && state.document.application && (
        <ResourceEditor
          resourceType={editing.resourceType}
          resourceId={editing.resourceId}
          formSchema={state.formSchemas[editing.resourceType]}
          initialValue={resourceValue(state.document, editing)}
          application={state.document.application}
          onSaved={() => {
            setEditing(undefined);
            load();
          }}
          onCancel={() => setEditing(undefined)}
        />
      )}
    </main>
  );
}
