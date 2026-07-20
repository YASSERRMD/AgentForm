import { generatedFileHeader, toIdentifier } from '@agentform/compiler';
import {
  resourceAddress,
  type IRWorkflow,
  type IRWorkflowEdge,
  type IRWorkflowNode,
} from '@agentform/ir';
import { loopCounterFieldName } from './generate-state.js';
import { pythonStringLiteral } from './python-repr.js';

interface NodeCodegen {
  readonly nodeId: string;
  readonly actionExpression: string;
  readonly inlineDefinition?: string;
  readonly agentImport?: string;
  readonly toolImport?: string;
  readonly usesToolNode?: boolean;
  readonly usesInterrupt?: boolean;
}

function indentDocstring(lines: readonly string[]): string {
  return lines.map((line) => (line.length > 0 ? `    ${line}` : '')).join('\n');
}

/**
 * Node ids, agent ids, and tool ids are all `@agentform/schema`'s
 * `identifierSchema` (letters/digits/underscore/hyphen only, semantically
 * validated to actually resolve) — never containing a quote character — so
 * a plain double-quoted literal is always safe and reads more like typical
 * (e.g. Black-formatted) Python than `pythonStringLiteral`'s
 * escaping-aware, single-quote-preferring output, which this file reserves
 * for free-text diagnostic messages instead.
 */
function pythonIdentifierLiteral(value: string): string {
  return JSON.stringify(value);
}

/**
 * Every node type the compatibility checker (`compatibility.ts`) accepts
 * gets real, structurally-correct code here — `agent`/`tool` nodes wrap the
 * reusable functions `generate-agent.ts`/`generate-tool.ts` produced;
 * `router`/`loop`/`humanApproval`/`terminate` are graph-wiring glue specific
 * to this one workflow, so they're generated inline rather than as their
 * own files. `compile()` (`@agentform/compiler`) never calls `generate()`
 * when the compatibility report has a blocking incompatibility, so every
 * node type reaching this function is one of the six handled below.
 */
function renderNode(nodeId: string, node: IRWorkflowNode, workflowId: string): NodeCodegen {
  switch (node.type) {
    case 'agent': {
      const fnName = `${toIdentifier(node.agent)}_node`;
      return { nodeId, actionExpression: fnName, agentImport: node.agent };
    }
    case 'tool': {
      const varName = toIdentifier(node.tool);
      return {
        nodeId,
        actionExpression: `ToolNode([${varName}])`,
        toolImport: node.tool,
        usesToolNode: true,
      };
    }
    case 'router': {
      const fnName = `${toIdentifier(nodeId)}_node`;
      const docstring = indentDocstring([
        `Router node "${nodeId}" — a pass-through waypoint; branching happens`,
        `in \`${toIdentifier(nodeId)}_path\` below.`,
      ]);
      const inlineDefinition = `def ${fnName}(state: State) -> dict:\n    """\n${docstring}\n    """\n    return {}\n`;
      return { nodeId, actionExpression: fnName, inlineDefinition };
    }
    case 'loop': {
      const fnName = `${toIdentifier(nodeId)}_node`;
      const counterField = pythonIdentifierLiteral(loopCounterFieldName(workflowId, nodeId));
      const docstring = indentDocstring([
        `Loop node "${nodeId}" (max_iterations=${node.maxIterations}) — increments its`,
        'iteration counter; the real loop body is application logic.',
      ]);
      const inlineDefinition =
        `def ${fnName}(state: State) -> dict:\n    """\n${docstring}\n    """\n` +
        `    return {${counterField}: state.get(${counterField}, 0) + 1}\n`;
      return { nodeId, actionExpression: fnName, inlineDefinition };
    }
    case 'humanApproval': {
      const fnName = `${toIdentifier(nodeId)}_node`;
      const docLines = [`Human approval node "${nodeId}".`, ''];
      if (node.approvers && node.approvers.length > 0) {
        docLines.push(`Approvers: ${node.approvers.join(', ')}`, '');
      }
      docLines.push(
        'Calls `interrupt()` to pause the graph until a human resumes it (see',
        "LangGraph's human-in-the-loop guide). TODO: use the returned decision",
        'to update state.',
      );
      const docstring = indentDocstring(docLines);
      const payload = `{${pythonIdentifierLiteral('node')}: ${pythonIdentifierLiteral(nodeId)}}`;
      const inlineDefinition =
        `def ${fnName}(state: State) -> dict:\n    """\n${docstring}\n    """\n` +
        `    decision = interrupt(${payload})\n` +
        `    raise NotImplementedError(${pythonStringLiteral(`TODO: act on the human decision for node "${nodeId}".`)})\n`;
      return { nodeId, actionExpression: fnName, inlineDefinition, usesInterrupt: true };
    }
    case 'terminate': {
      const fnName = `${toIdentifier(nodeId)}_node`;
      const docLines = [`Terminate node "${nodeId}".`];
      if (node.reason) {
        docLines.push('', `Reason: ${node.reason}`);
      }
      const docstring = indentDocstring(docLines);
      const inlineDefinition = `def ${fnName}(state: State) -> dict:\n    """\n${docstring}\n    """\n    return {}\n`;
      return { nodeId, actionExpression: fnName, inlineDefinition };
    }
    default:
      // Unreachable in practice: `compile()` (`@agentform/compiler`) never calls
      // `generate()` while `validateLangGraphCompatibility` reports a blocking
      // incompatibility, and every node type not handled above is reported
      // unsupported there.
      throw new Error(
        `generate-workflow: unsupported node type "${(node as IRWorkflowNode).type}" on node "${nodeId}"`,
      );
  }
}

/**
 * Groups edges by source node: exactly one edge with no `when` becomes a
 * plain `add_edge`; anything else (multiple edges, or a `when` guard) needs
 * a real branching decision, so it becomes an `add_conditional_edges` call
 * backed by a stub path function (Agentform's edge `when` expressions have
 * no evaluator yet anywhere in this codebase — parsing/evaluating them
 * safely, without `eval`, is out of scope here; see the workflow schema's
 * own doc comment on `when`). A node with zero outgoing edges is a sink —
 * Agentform's own graph validation already guarantees every workflow has a
 * terminal path, so a sink is exactly where this graph should reach `END`.
 */
function renderEdgesForNode(
  nodeId: string,
  edgesFromNode: readonly IRWorkflowEdge[],
): { readonly statements: string; readonly pathFunctionDefinition?: string } {
  const nodeRef = pythonIdentifierLiteral(nodeId);
  const [onlyEdge] = edgesFromNode;

  if (edgesFromNode.length === 0) {
    return { statements: `    builder.add_edge(${nodeRef}, END)\n` };
  }

  if (edgesFromNode.length === 1 && onlyEdge !== undefined && onlyEdge.when === undefined) {
    return {
      statements: `    builder.add_edge(${nodeRef}, ${pythonIdentifierLiteral(onlyEdge.to)})\n`,
    };
  }

  const fnName = `${toIdentifier(nodeId)}_path`;
  const docLines = [`Routing function for node "${nodeId}".`, '', 'Declared transitions:'];
  for (const edge of edgesFromNode) {
    docLines.push(edge.when ? `  - "${edge.to}" when: ${edge.when}` : `  - "${edge.to}" (default)`);
  }
  docLines.push('', `TODO: implement the real condition(s) above.`);
  const docstring = indentDocstring(docLines);
  const pathFunctionDefinition =
    `def ${fnName}(state: State) -> str:\n    """\n${docstring}\n    """\n` +
    `    raise NotImplementedError(${pythonStringLiteral(`TODO: implement routing logic for node "${nodeId}".`)})\n`;

  const pathMapEntries = edgesFromNode
    .map(
      (edge) =>
        `            ${pythonIdentifierLiteral(edge.to)}: ${pythonIdentifierLiteral(edge.to)},`,
    )
    .join('\n');
  const statements =
    `    builder.add_conditional_edges(\n` +
    `        ${nodeRef},\n` +
    `        ${fnName},\n` +
    `        {\n${pathMapEntries}\n        },\n` +
    `    )\n`;

  return { statements, pathFunctionDefinition };
}

/**
 * One workflow becomes one `build_graph()` function assembling a real
 * `StateGraph` (`langgraph.graph`'s real API — verified against the
 * installed package). Compiling with a checkpointer (`main.py`'s job, since
 * that's a runtime/deployment choice, not a graph-structure one) is what
 * makes the `humanApproval` nodes' `interrupt()` calls actually pause and
 * resume.
 */
export function generateWorkflowFile(workflowId: string, workflow: IRWorkflow): string {
  const header = generatedFileHeader({
    commentPrefix: '#',
    sourceResourceAddresses: [resourceAddress('workflow', workflowId)],
  });

  const nodes = [...workflow.nodes.entries()];
  const nodeCodegens = nodes.map(([nodeId, node]) => renderNode(nodeId, node, workflowId));

  const agentImports = new Set<string>();
  const toolImports = new Set<string>();
  let usesToolNode = false;
  let usesInterrupt = false;
  const inlineDefinitions: string[] = [];
  for (const codegen of nodeCodegens) {
    if (codegen.agentImport) agentImports.add(codegen.agentImport);
    if (codegen.toolImport) toolImports.add(codegen.toolImport);
    if (codegen.usesToolNode) usesToolNode = true;
    if (codegen.usesInterrupt) usesInterrupt = true;
    if (codegen.inlineDefinition) inlineDefinitions.push(codegen.inlineDefinition);
  }

  const edgesByFromNode = new Map<string, IRWorkflowEdge[]>();
  for (const [nodeId] of nodes) {
    edgesByFromNode.set(nodeId, []);
  }
  for (const edge of workflow.edges) {
    edgesByFromNode.get(edge.from)?.push(edge);
  }

  const edgeCodegens = nodes.map(([nodeId]) =>
    renderEdgesForNode(nodeId, edgesByFromNode.get(nodeId) ?? []),
  );
  for (const { pathFunctionDefinition } of edgeCodegens) {
    if (pathFunctionDefinition) {
      inlineDefinitions.push(pathFunctionDefinition);
    }
  }

  const importLines = [
    `from langgraph.graph import END, START, StateGraph`,
    usesToolNode ? `from langgraph.prebuilt import ToolNode` : undefined,
    usesInterrupt ? `from langgraph.types import interrupt` : undefined,
    '',
    `from ..state import State`,
    ...[...agentImports]
      .sort()
      .map(
        (agentId) => `from ..agents.${toIdentifier(agentId)} import ${toIdentifier(agentId)}_node`,
      ),
    ...[...toolImports]
      .sort()
      .map((toolId) => `from ..tools.${toIdentifier(toolId)} import ${toIdentifier(toolId)}`),
  ].filter((line): line is string => line !== undefined);

  const addNodeLines = nodeCodegens
    .map(
      (codegen) =>
        `    builder.add_node(${pythonIdentifierLiteral(codegen.nodeId)}, ${codegen.actionExpression})`,
    )
    .join('\n');

  const edgeLines = [
    `    builder.add_edge(START, ${pythonIdentifierLiteral(workflow.entrypoint)})`,
    ...edgeCodegens.map((codegen) => codegen.statements.trimEnd()),
  ].join('\n');

  return (
    `${header}\n\n` +
    `${importLines.join('\n')}\n\n\n` +
    `${inlineDefinitions.join('\n\n')}\n\n` +
    `def build_graph() -> StateGraph:\n` +
    `    """Builds the "${workflowId}" workflow graph. Call \`.compile()\` (with a checkpointer, for human-approval support) before running it."""\n` +
    `    builder = StateGraph(State)\n\n` +
    `${addNodeLines}\n\n` +
    `${edgeLines}\n\n` +
    `    return builder\n`
  );
}
