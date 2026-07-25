import type { Agent, Diagnostic } from '@agentform/studio-core';
import type { FormLayout, LayoutNode, LayoutWidget } from '@agentform/studio-design';
import { useEffect, useState } from 'react';
import { getDesign, putDesign } from '../../api/client';
import { extractSchemaFields } from '../../lib/extract-schema-fields';
import {
  addContainer,
  addField,
  moveField,
  moveFieldIntoContainer,
  normalizeFormLayout,
  removeField,
  setFieldWidget,
} from '../../lib/form-layout-ops';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { ChatDesignPanel } from './ChatDesignPanel';

export interface FormLayoutEditorProps {
  readonly agentId: string;
  readonly agent: Agent;
}

const WIDGETS: readonly LayoutWidget[] = [
  'text',
  'textarea',
  'number',
  'select',
  'checkbox',
  'date',
];

function collectContainerIds(nodes: readonly LayoutNode[]): string[] {
  return nodes.flatMap((node) =>
    node.type === 'container' ? [node.id, ...collectContainerIds(node.children ?? [])] : [],
  );
}

function flattenFieldPaths(nodes: readonly LayoutNode[]): string[] {
  return nodes.flatMap((node) =>
    node.type === 'field' && node.fieldPath !== undefined
      ? [node.fieldPath]
      : flattenFieldPaths(node.children ?? []),
  );
}

function LayoutNodeRow({
  node,
  fieldPath,
  containerIds,
  onMoveUp,
  onMoveDown,
  onRemove,
  onSetWidget,
  onMoveIntoContainer,
}: {
  readonly node: LayoutNode;
  readonly fieldPath: string;
  readonly containerIds: readonly string[];
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
  readonly onRemove: () => void;
  readonly onSetWidget: (widget: LayoutWidget) => void;
  readonly onMoveIntoContainer: (containerId: string) => void;
}) {
  return (
    <li aria-label={`Layout field ${fieldPath}`}>
      <span>{node.label ?? fieldPath}</span>
      <button type="button" onClick={onMoveUp}>
        ↑
      </button>
      <button type="button" onClick={onMoveDown}>
        ↓
      </button>
      <select
        value={node.widget ?? ''}
        onChange={(e) => onSetWidget(e.target.value as LayoutWidget)}
      >
        <option value="" disabled>
          widget…
        </option>
        {WIDGETS.map((widget) => (
          <option key={widget} value={widget}>
            {widget}
          </option>
        ))}
      </select>
      {containerIds.length > 0 && (
        <select value="" onChange={(e) => e.target.value && onMoveIntoContainer(e.target.value)}>
          <option value="">move into group…</option>
          {containerIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      )}
      <button type="button" onClick={onRemove}>
        Remove
      </button>
    </li>
  );
}

function SectionEditor({
  title,
  schemaValue,
  nodes,
  onAddField,
  onAddGroup,
  onMoveUp,
  onMoveDown,
  onRemove,
  onSetWidget,
  onMoveIntoContainer,
}: {
  readonly title: string;
  readonly schemaValue: unknown;
  readonly nodes: readonly LayoutNode[];
  readonly onAddField: (path: string, label: string) => void;
  readonly onAddGroup: (label: string) => void;
  readonly onMoveUp: (fieldPath: string) => void;
  readonly onMoveDown: (fieldPath: string) => void;
  readonly onRemove: (fieldPath: string) => void;
  readonly onSetWidget: (fieldPath: string, widget: LayoutWidget) => void;
  readonly onMoveIntoContainer: (fieldPath: string, containerId: string) => void;
}) {
  const available = extractSchemaFields(schemaValue);
  const placed = new Set(flattenFieldPaths(nodes));
  const unplaced = available.filter((field) => !placed.has(field.path));
  const containerIds = collectContainerIds(nodes);

  function renderNodes(list: readonly LayoutNode[]) {
    return list.map((node) => {
      if (node.type === 'container') {
        return (
          <li key={node.id} aria-label={`Layout group ${node.id}`}>
            <strong>{node.label ?? node.id}</strong>
            <ul>{renderNodes(node.children ?? [])}</ul>
          </li>
        );
      }
      // A field node with no fieldPath can't be edited by anything here
      // (every op below is keyed by fieldPath) — skip rather than crash;
      // this shouldn't happen from Studio's own writes, only from a
      // design artifact edited outside it.
      if (node.fieldPath === undefined) {
        return null;
      }
      const fieldPath = node.fieldPath;
      return (
        <LayoutNodeRow
          key={node.id}
          node={node}
          fieldPath={fieldPath}
          containerIds={containerIds.filter((id) => id !== node.id)}
          onMoveUp={() => onMoveUp(fieldPath)}
          onMoveDown={() => onMoveDown(fieldPath)}
          onRemove={() => onRemove(fieldPath)}
          onSetWidget={(widget) => onSetWidget(fieldPath, widget)}
          onMoveIntoContainer={(containerId) => onMoveIntoContainer(fieldPath, containerId)}
        />
      );
    });
  }

  return (
    <fieldset aria-label={`${title} layout`}>
      <legend>{title}</legend>
      <ul>{renderNodes(nodes)}</ul>
      {unplaced.length > 0 && (
        <label>
          <span>Add field</span>
          <select
            value=""
            onChange={(e) => {
              const field = unplaced.find((f) => f.path === e.target.value);
              if (field) {
                onAddField(field.path, field.label);
              }
            }}
          >
            <option value="">choose…</option>
            {unplaced.map((field) => (
              <option key={field.path} value={field.path}>
                {field.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        onClick={() => {
          const label = window.prompt('Group name?');
          if (label) {
            onAddGroup(label);
          }
        }}
      >
        Add group
      </button>
    </fieldset>
  );
}

/**
 * Edits presentational layout for one agent's inputSchema/outputSchema
 * fields — never the schema content itself (see form-layout-ops.ts).
 * Its own save path is entirely separate from the agent's own field
 * editor: it writes a design artifact via PUT /api/design/agents/:id,
 * never a spec patch.
 */
export function FormLayoutEditor({ agentId, agent }: FormLayoutEditorProps) {
  const [layout, setLayout] = useState<FormLayout>({ input: [], output: [] });
  // Tracks which agentId's design the current `layout` actually reflects,
  // so "loaded" is derived (loadedFor === agentId) rather than a second
  // piece of state that needs its own synchronous reset when agentId
  // changes — react-hooks/set-state-in-effect flags that pattern.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [saved, setSaved] = useState(false);
  const loaded = loadedFor === agentId;

  useEffect(() => {
    let cancelled = false;
    getDesign('agents', agentId)
      .then((response) => {
        if (!cancelled) {
          setLayout(normalizeFormLayout(response.design?.layout));
          setLoadedFor(agentId);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedFor(agentId);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  function updateLayout(fn: (layout: FormLayout) => FormLayout) {
    setSaved(false);
    setLayout((current) => fn(current));
  }

  async function handleSave() {
    setSaving(true);
    setDiagnostics([]);
    try {
      const result = await putDesign('agents', agentId, {
        binding: { resourceType: 'agents', resourceId: agentId },
        layout,
      });
      if (result.success) {
        setSaved(true);
      } else {
        setDiagnostics(result.diagnostics);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <p>Loading layout…</p>;
  }

  return (
    <section aria-label={`Form layout for agent ${agentId}`}>
      <ChatDesignPanel
        agentId={agentId}
        onAccept={(layout) => updateLayout(() => normalizeFormLayout(layout))}
      />
      <SectionEditor
        title="Input fields"
        schemaValue={agent.inputSchema}
        nodes={layout.input ?? []}
        onAddField={(path, label) => updateLayout((l) => addField(l, 'input', { path, label }))}
        onAddGroup={(label) => updateLayout((l) => addContainer(l, 'input', label))}
        onMoveUp={(path) => updateLayout((l) => moveField(l, 'input', path, 'up'))}
        onMoveDown={(path) => updateLayout((l) => moveField(l, 'input', path, 'down'))}
        onRemove={(path) => updateLayout((l) => removeField(l, 'input', path))}
        onSetWidget={(path, widget) =>
          updateLayout((l) => setFieldWidget(l, 'input', path, widget))
        }
        onMoveIntoContainer={(path, containerId) =>
          updateLayout((l) => moveFieldIntoContainer(l, 'input', path, containerId))
        }
      />
      <SectionEditor
        title="Output fields"
        schemaValue={agent.outputSchema}
        nodes={layout.output ?? []}
        onAddField={(path, label) => updateLayout((l) => addField(l, 'output', { path, label }))}
        onAddGroup={(label) => updateLayout((l) => addContainer(l, 'output', label))}
        onMoveUp={(path) => updateLayout((l) => moveField(l, 'output', path, 'up'))}
        onMoveDown={(path) => updateLayout((l) => moveField(l, 'output', path, 'down'))}
        onRemove={(path) => updateLayout((l) => removeField(l, 'output', path))}
        onSetWidget={(path, widget) =>
          updateLayout((l) => setFieldWidget(l, 'output', path, widget))
        }
        onMoveIntoContainer={(path, containerId) =>
          updateLayout((l) => moveFieldIntoContainer(l, 'output', path, containerId))
        }
      />
      {diagnostics.length > 0 && <DiagnosticsPanel diagnostics={diagnostics} />}
      {saved && <p role="status">Layout saved.</p>}
      <button type="button" onClick={() => void handleSave()} disabled={saving}>
        {saving ? 'Saving…' : 'Save layout'}
      </button>
    </section>
  );
}
