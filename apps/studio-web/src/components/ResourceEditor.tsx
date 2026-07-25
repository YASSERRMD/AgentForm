import type {
  AgenticApplication,
  Diagnostic,
  ResourceFormSchema,
  ResourceType,
  SpecPatch,
} from '@agentform/studio-core';
import { useState } from 'react';
import { patchSpec } from '../api/client';
import { discriminatorConst, isRecord } from '../lib/json-schema-utils';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { ResourceForm } from './ResourceForm';
import { WorkflowCanvas } from './workflow/WorkflowCanvas';

export interface ResourceEditorProps {
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly formSchema: ResourceFormSchema;
  /** `undefined` means this is a new resource being added, not an edit of an existing one. */
  readonly initialValue: unknown;
  /** Only read for `resourceType === 'workflows'` — the canvas needs the surrounding application (tools, for risk warnings; the rest of the spec, for live cross-reference validation). */
  readonly application: AgenticApplication;
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}

/**
 * Owns the save/cancel flow and, for a resource type whose schema is a
 * real top-level `oneOf` (tools' `z.discriminatedUnion('type', [...])`
 * — see ResourceForm's own doc comment), the variant picker: it
 * resolves *which* concrete object shape is being edited before
 * ResourceForm ever sees it, so ResourceForm itself only ever renders
 * one flat schema at a time.
 */
export function ResourceEditor({
  resourceType,
  resourceId,
  formSchema,
  initialValue,
  application,
  onSaved,
  onCancel,
}: ResourceEditorProps) {
  const variants = Array.isArray(formSchema.jsonSchema.oneOf)
    ? (formSchema.jsonSchema.oneOf as Record<string, unknown>[])
    : undefined;

  const initialVariantType =
    isRecord(initialValue) && typeof initialValue.type === 'string' ? initialValue.type : undefined;
  const [variantType, setVariantType] = useState<string | undefined>(
    initialVariantType ?? (variants ? discriminatorConst(variants[0]) : undefined),
  );
  const [value, setValue] = useState<unknown>(initialValue ?? {});
  const [saving, setSaving] = useState(false);
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);

  const activeSchema =
    variants?.find((variant) => discriminatorConst(variant) === variantType) ??
    variants?.[0] ??
    formSchema.jsonSchema;

  async function handleSave() {
    setSaving(true);
    setDiagnostics([]);
    const finalValue =
      variants && variantType ? { ...(isRecord(value) ? value : {}), type: variantType } : value;
    const patch: SpecPatch = [
      {
        op: initialValue === undefined ? 'add' : 'replace',
        path: ['spec', resourceType, resourceId],
        value: finalValue,
      },
    ];
    try {
      const result = await patchSpec(patch);
      if (result.success) {
        onSaved();
      } else {
        setDiagnostics(result.diagnostics);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label={`Edit ${resourceType}.${resourceId}`}>
      <h3>
        {resourceType}.{resourceId}
      </h3>
      {variants && (
        <label>
          <span>type</span>
          <select value={variantType ?? ''} onChange={(e) => setVariantType(e.target.value)}>
            {variants.map((variant) => {
              const type = discriminatorConst(variant);
              return (
                <option key={type} value={type}>
                  {type}
                </option>
              );
            })}
          </select>
        </label>
      )}
      {resourceType === 'workflows' ? (
        <WorkflowCanvas
          workflowId={resourceId}
          value={value}
          onChange={setValue}
          application={application}
        />
      ) : (
        <ResourceForm jsonSchema={activeSchema} value={value} onChange={setValue} />
      )}
      {diagnostics.length > 0 && <DiagnosticsPanel diagnostics={diagnostics} />}
      <button type="button" onClick={() => void handleSave()} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={onCancel} disabled={saving}>
        Cancel
      </button>
    </section>
  );
}
