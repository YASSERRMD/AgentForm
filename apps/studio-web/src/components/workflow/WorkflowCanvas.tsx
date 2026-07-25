import { validateSemantics } from '@agentform/ir/browser';
import {
  findUngatedDestructiveToolNodes,
  generateWorkflowNodeFormSchema,
  type AgenticApplication,
  type Diagnostic,
  type Workflow,
  type WorkflowNodeType,
} from '@agentform/studio-core';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useState } from 'react';
import {
  addNode,
  addWorkflowEdge,
  deleteEdge,
  deleteNode,
  normalizeWorkflow,
  setEntrypoint,
  updateEdgeWhen,
  updateNode,
} from '../../lib/workflow-edit-ops';
import {
  buildFlowEdges,
  buildFlowNodes,
  type WorkflowFlowEdge,
  type WorkflowFlowNode,
} from '../../lib/workflow-graph-view';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { WorkflowNodeEditor } from './WorkflowNodeEditor';
import { WorkflowNodeShape } from './WorkflowNodeShape';

const NODE_TYPES = { workflowNode: WorkflowNodeShape };
const LIVE_VALIDATION_DEBOUNCE_MS = 300;

const ALL_NODE_TYPES: readonly WorkflowNodeType[] = [
  'agent',
  'tool',
  'router',
  'parallel',
  'join',
  'loop',
  'humanApproval',
  'delay',
  'event',
  'subworkflow',
  'transform',
  'condition',
  'terminate',
];

function pathStartsWith(diagnostic: Diagnostic, prefix: readonly string[]): boolean {
  if (!diagnostic.path || diagnostic.path.length < prefix.length) {
    return false;
  }
  return prefix.every((segment, index) => diagnostic.path?.[index] === segment);
}

export interface WorkflowCanvasProps {
  readonly workflowId: string;
  /** The `workflows.<id>` resource value `ResourceEditor` is tracking — not necessarily a valid `Workflow` yet (e.g. a brand-new, still-empty resource). */
  readonly value: unknown;
  readonly onChange: (value: Workflow) => void;
  /** Surrounding application context: tool definitions for risk warnings, and the rest of the spec for live cross-reference validation. */
  readonly application: AgenticApplication;
}

function WorkflowCanvasInner({ workflowId, value, onChange, application }: WorkflowCanvasProps) {
  const workflow = useMemo(() => normalizeWorkflow(value), [value]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [selectedEdgeIndex, setSelectedEdgeIndex] = useState<number | undefined>(undefined);
  const [newNodeId, setNewNodeId] = useState('');
  const [newNodeType, setNewNodeType] = useState<WorkflowNodeType>('agent');
  const [liveDiagnostics, setLiveDiagnostics] = useState<readonly Diagnostic[]>([]);

  const tools = useMemo(() => application.spec.tools ?? {}, [application.spec.tools]);
  const unsafeNodeIds = useMemo(
    () => new Set(findUngatedDestructiveToolNodes(workflow, tools)),
    [workflow, tools],
  );

  const flowNodes = useMemo(
    () => buildFlowNodes(workflow, unsafeNodeIds),
    [workflow, unsafeNodeIds],
  );
  const flowEdges = useMemo(() => buildFlowEdges(workflow), [workflow]);

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowFlowEdge>(flowEdges);

  // React Flow's local state (drag position, selection) is re-derived from
  // the workflow's real structure whenever a node/edge is added or removed.
  // Positions are never persisted (see workflow-layout.ts) — a structural
  // change resets any manual dragging done since the last one, which is an
  // accepted, documented limitation of this phase, not an oversight.
  useEffect(() => setNodes(flowNodes), [flowNodes, setNodes]);
  useEffect(() => setEdges(flowEdges), [flowEdges, setEdges]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const draftApplication: AgenticApplication = {
        ...application,
        spec: {
          ...application.spec,
          workflows: { ...application.spec.workflows, [workflowId]: workflow },
        },
      };
      const allDiagnostics = validateSemantics(draftApplication);
      setLiveDiagnostics(
        allDiagnostics.filter((d) => pathStartsWith(d, ['spec', 'workflows', workflowId])),
      );
    }, LIVE_VALIDATION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [workflow, workflowId, application]);

  const onConnect: OnConnect = (connection: Connection) => {
    onChange(addWorkflowEdge(workflow, connection.source, connection.target));
  };

  function handleNodeClick(_event: unknown, node: WorkflowFlowNode) {
    setSelectedEdgeIndex(undefined);
    setSelectedNodeId(node.id);
  }

  function handleEdgeClick(_event: unknown, edge: Edge) {
    setSelectedNodeId(undefined);
    setSelectedEdgeIndex((edge.data as { edgeIndex?: number } | undefined)?.edgeIndex);
  }

  function handleAddNode() {
    if (!newNodeId.trim() || workflow.nodes[newNodeId.trim()]) {
      return;
    }
    const id = newNodeId.trim();
    onChange(addNode(workflow, id, newNodeType));
    setNewNodeId('');
    setSelectedEdgeIndex(undefined);
    setSelectedNodeId(id);
  }

  const nodeFormSchema = useMemo(() => generateWorkflowNodeFormSchema(), []);
  const selectedNode = selectedNodeId ? workflow.nodes[selectedNodeId] : undefined;
  const selectedEdge =
    selectedEdgeIndex !== undefined ? (workflow.edges ?? [])[selectedEdgeIndex] : undefined;

  return (
    <div>
      <div style={{ height: 420, border: '1px solid #d1d5db' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAddNode();
        }}
      >
        <input
          type="text"
          placeholder="new node id"
          aria-label="New node id"
          value={newNodeId}
          onChange={(e) => setNewNodeId(e.target.value)}
        />
        <select
          aria-label="New node type"
          value={newNodeType}
          onChange={(e) => setNewNodeType(e.target.value as WorkflowNodeType)}
        >
          {ALL_NODE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <button type="submit">Add node</button>
      </form>

      {selectedNodeId && selectedNode && (
        <WorkflowNodeEditor
          nodeId={selectedNodeId}
          value={selectedNode}
          nodeFormSchema={nodeFormSchema}
          isEntrypoint={selectedNodeId === workflow.entrypoint}
          onChange={(nextNode) => onChange(updateNode(workflow, selectedNodeId, nextNode))}
          onSetEntrypoint={() => onChange(setEntrypoint(workflow, selectedNodeId))}
          onDelete={() => {
            onChange(deleteNode(workflow, selectedNodeId));
            setSelectedNodeId(undefined);
          }}
          onClose={() => setSelectedNodeId(undefined)}
        />
      )}

      {selectedEdgeIndex !== undefined && selectedEdge && (
        <section aria-label={`Edit edge ${selectedEdge.from} to ${selectedEdge.to}`}>
          <h4>
            {selectedEdge.from} → {selectedEdge.to}
          </h4>
          <label>
            <span>when</span>
            <input
              type="text"
              value={selectedEdge.when ?? ''}
              onChange={(e) =>
                onChange(updateEdgeWhen(workflow, selectedEdgeIndex, e.target.value))
              }
            />
          </label>
          <button
            type="button"
            onClick={() => {
              onChange(deleteEdge(workflow, selectedEdgeIndex));
              setSelectedEdgeIndex(undefined);
            }}
          >
            Delete edge
          </button>
          <button type="button" onClick={() => setSelectedEdgeIndex(undefined)}>
            Close
          </button>
        </section>
      )}

      <DiagnosticsPanel diagnostics={liveDiagnostics} />
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
