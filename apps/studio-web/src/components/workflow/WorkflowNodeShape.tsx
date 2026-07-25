import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowFlowNode } from '../../lib/workflow-graph-view';
import {
  CATEGORY_COLOR,
  summarizeWorkflowNode,
  WORKFLOW_NODE_CATEGORY,
} from '../../lib/workflow-node-visuals';

/**
 * The one custom node renderer for all 13 real node types — parameterized
 * by `workflow-node-visuals`'s category/color/summary lookup rather than
 * 13 separate components, since every type shares the same layout (a
 * colored category bar, the node id, the type, and a one-line summary of
 * its own distinguishing field) and only the content differs.
 */
export function WorkflowNodeShape({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const category = WORKFLOW_NODE_CATEGORY[data.node.type];
  const color = CATEGORY_COLOR[category];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Workflow node ${data.nodeId}`}
      style={{
        border: `2px solid ${selected ? '#111827' : color}`,
        borderLeft: `8px solid ${color}`,
        borderRadius: 6,
        padding: '6px 10px',
        background: '#ffffff',
        minWidth: 160,
        fontSize: 12,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 600 }}>
        {data.nodeId}
        {data.isEntrypoint && ' (entrypoint)'}
      </div>
      <div style={{ color: '#6b7280' }}>{data.node.type}</div>
      <div>{summarizeWorkflowNode(data.node)}</div>
      {data.isUnsafe && (
        <div style={{ color: '#b91c1c', fontWeight: 600 }}>⚠ ungated destructive tool</div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
