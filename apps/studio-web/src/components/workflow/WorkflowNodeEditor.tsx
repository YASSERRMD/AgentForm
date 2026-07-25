import type { WorkflowNode } from '@agentform/studio-core';
import { useState } from 'react';
import { discriminatorConst, isRecord } from '../../lib/json-schema-utils';
import { ResourceForm } from '../ResourceForm';

export interface WorkflowNodeEditorProps {
  readonly nodeId: string;
  readonly value: WorkflowNode;
  /** The real `oneOf` JSON Schema for `workflowNodeSchema` (13 variants) — same shape `tools` produces, one level deeper. */
  readonly nodeFormSchema: Record<string, unknown>;
  readonly isEntrypoint: boolean;
  readonly onChange: (value: WorkflowNode) => void;
  readonly onSetEntrypoint: () => void;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}

/**
 * Edits one workflow node's own fields — the identical variant-picker-
 * then-ResourceForm pattern `ResourceEditor` already established for
 * `tools`' discriminated union, just applied one level deeper (13 node
 * types instead of tools' variants). Unlike `ResourceEditor`, this never
 * calls `patchSpec` itself: `onChange` updates the in-memory draft
 * `Workflow` the canvas owns, and the canvas's own Save button (inherited
 * from `ResourceEditor`, which treats the whole workflow as one resource)
 * is what actually persists it.
 */
export function WorkflowNodeEditor({
  nodeId,
  value,
  nodeFormSchema,
  isEntrypoint,
  onChange,
  onSetEntrypoint,
  onDelete,
  onClose,
}: WorkflowNodeEditorProps) {
  const variants = Array.isArray(nodeFormSchema.oneOf)
    ? (nodeFormSchema.oneOf as Record<string, unknown>[])
    : [];
  const [variantType, setVariantType] = useState<string>(value.type);

  const activeSchema =
    variants.find((variant) => discriminatorConst(variant) === variantType) ?? variants[0] ?? {};

  function handleFieldsChange(nextValue: unknown) {
    const record = isRecord(nextValue) ? nextValue : {};
    onChange({ ...record, type: variantType } as WorkflowNode);
  }

  function handleVariantChange(nextType: string) {
    setVariantType(nextType);
    onChange({ type: nextType } as WorkflowNode);
  }

  return (
    <section aria-label={`Edit workflow node ${nodeId}`}>
      <h4>{nodeId}</h4>
      <label>
        <span>type</span>
        <select value={variantType} onChange={(e) => handleVariantChange(e.target.value)}>
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
      <ResourceForm jsonSchema={activeSchema} value={value} onChange={handleFieldsChange} />
      <button type="button" onClick={onSetEntrypoint} disabled={isEntrypoint}>
        {isEntrypoint ? 'Entrypoint' : 'Set as entrypoint'}
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={isEntrypoint}
        title={isEntrypoint ? 'Set a different entrypoint before deleting this node.' : undefined}
      >
        Delete node
      </button>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </section>
  );
}
