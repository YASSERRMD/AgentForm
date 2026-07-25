import type { AgenticApplication, ResourceType } from '@agentform/studio-core';
import { useState } from 'react';

export interface SpecViewerProps {
  readonly application: AgenticApplication;
  readonly onEditResource?: (resourceType: ResourceType, resourceId: string) => void;
}

interface ResourceListProps {
  readonly title: string;
  readonly resourceType: ResourceType;
  readonly ids: readonly string[];
  readonly onEditResource?: (resourceType: ResourceType, resourceId: string) => void;
}

function ResourceList({ title, resourceType, ids, onEditResource }: ResourceListProps) {
  const [newId, setNewId] = useState('');

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
            <li key={id}>
              {onEditResource ? (
                <button type="button" onClick={() => onEditResource(resourceType, id)}>
                  {id}
                </button>
              ) : (
                id
              )}
            </li>
          ))}
        </ul>
      )}
      {onEditResource && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (newId.trim().length > 0) {
              onEditResource(resourceType, newId.trim());
              setNewId('');
            }
          }}
        >
          <input
            type="text"
            aria-label={`New ${title.toLowerCase()} id`}
            placeholder="new id"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>
      )}
    </section>
  );
}

/**
 * Read-only rendering of a validated spec — metadata plus each resource
 * collection listed by id — that becomes editable the moment a caller
 * passes `onEditResource` (Phase 14): each id is then a real button
 * opening ResourceEditor, and each section gets an inline "add new"
 * form. Without it, this is exactly Phase 13's read-only viewer,
 * unchanged.
 */
export function SpecViewer({ application, onEditResource }: SpecViewerProps) {
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
      <ResourceList
        title="Models"
        resourceType="models"
        ids={Object.keys(spec.models)}
        onEditResource={onEditResource}
      />
      <ResourceList
        title="Agents"
        resourceType="agents"
        ids={Object.keys(spec.agents)}
        onEditResource={onEditResource}
      />
      <ResourceList
        title="Tools"
        resourceType="tools"
        ids={Object.keys(spec.tools ?? {})}
        onEditResource={onEditResource}
      />
      <ResourceList
        title="Workflows"
        resourceType="workflows"
        ids={Object.keys(spec.workflows)}
        onEditResource={onEditResource}
      />
    </article>
  );
}
