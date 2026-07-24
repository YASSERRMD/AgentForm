import type { AgenticApplication } from '@agentform/studio-core';

export interface SpecViewerProps {
  readonly application: AgenticApplication;
}

interface ResourceListProps {
  readonly title: string;
  readonly ids: readonly string[];
}

function ResourceList({ title, ids }: ResourceListProps) {
  return (
    <section>
      <h3>
        {title} ({ids.length})
      </h3>
      {ids.length === 0 ? (
        <p>None declared.</p>
      ) : (
        <ul>
          {ids.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Read-only rendering of a validated spec — metadata plus each resource
 * collection listed by id. Not a raw JSON dump (nothing here helps a
 * user understand their project), and not a graph/canvas either — that
 * arrives in Phase 15.
 */
export function SpecViewer({ application }: SpecViewerProps) {
  const { metadata, spec } = application;

  return (
    <article aria-label="Specification">
      <header>
        <h2>{metadata.name}</h2>
        <p>
          v{metadata.version} &middot; target: {spec.runtime.target} &middot; environment:{' '}
          {spec.runtime.environment}
        </p>
        {metadata.description && <p>{metadata.description}</p>}
      </header>
      <ResourceList title="Models" ids={Object.keys(spec.models)} />
      <ResourceList title="Agents" ids={Object.keys(spec.agents)} />
      <ResourceList title="Tools" ids={Object.keys(spec.tools ?? {})} />
      <ResourceList title="Workflows" ids={Object.keys(spec.workflows)} />
    </article>
  );
}
