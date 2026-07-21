import { slugifyIdentifier, walkSourceFiles } from '@agentform/core';
import type { ImportCandidate, ImportContext, ImportInspection } from '@agentform/plugin-sdk';

const SOURCE_EXTENSIONS = ['.py'];

/** Any one of these appearing anywhere in a scanned file is enough to say "this project uses LangGraph" — an import line or a `StateGraph(` construction, not a specific graph shape. */
const RECOGNITION_SIGNALS = [/from\s+langgraph/, /^\s*import\s+langgraph\b/m, /\bStateGraph\s*\(/];

const ADD_NODE = /\.add_node\(\s*["']([^"']+)["']\s*,\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)/g;
const ADD_EDGE = /\.add_edge\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/g;
const SET_ENTRY_POINT = /\.set_entry_point\(\s*["']([^"']+)["']\s*\)/;

interface RecognizedGraph {
  readonly workflowId: string;
  readonly nodeIds: readonly string[];
  readonly nodeHandlers: ReadonlyMap<string, string>;
  readonly edges: readonly { from: string; to: string }[];
  readonly entrypoint?: string;
}

function graphNameFor(filePath: string): string {
  const base = filePath.split('/').pop()?.replace(/\.py$/, '') ?? 'main';
  return slugifyIdentifier(base, 'main');
}

function findGraphs(content: string, filePath: string): readonly RecognizedGraph[] {
  if (!/\bStateGraph\s*\(/.test(content)) {
    return [];
  }

  const nodeIds: string[] = [];
  const nodeHandlers = new Map<string, string>();
  for (const match of content.matchAll(ADD_NODE)) {
    const [, nodeId, handler] = match;
    if (!nodeId || nodeIds.includes(nodeId)) {
      continue;
    }
    nodeIds.push(nodeId);
    if (handler) {
      nodeHandlers.set(nodeId, handler);
    }
  }
  if (nodeIds.length === 0) {
    return [];
  }

  const edges = [...content.matchAll(ADD_EDGE)]
    .map((match) => ({ from: match[1], to: match[2] }))
    .filter((edge): edge is { from: string; to: string } => Boolean(edge.from && edge.to));

  return [
    {
      workflowId: graphNameFor(filePath),
      nodeIds,
      nodeHandlers,
      edges,
      entrypoint: SET_ENTRY_POINT.exec(content)?.[1],
    },
  ];
}

/**
 * Limited, heuristic recognition of a raw LangGraph project (§15.12's
 * initial import scope) — regex-based source scanning of `.add_node`/
 * `.add_edge`/`.set_entry_point` call sites, not a real Python parser.
 * Every recognized node becomes a placeholder `agent` resource of type
 * `"agent"` regardless of what its handler function actually does —
 * LangGraph node handlers are arbitrary Python functions, and inferring
 * their real Agentform node type (`tool`/`router`/`humanApproval`/...)
 * from a function name or reference alone would be guessing, not
 * recognizing. §15.12 "never claim perfect reverse engineering."
 */
export async function inspectLangGraphProject(context: ImportContext): Promise<ImportInspection> {
  const files = walkSourceFiles(context.rootDir, { extensions: SOURCE_EXTENSIONS });
  const recognized = files.some((file) =>
    RECOGNITION_SIGNALS.some((signal) => signal.test(file.content)),
  );
  if (!recognized) {
    return { recognized: false, candidates: [], unsupportedConstructs: [], manualActions: [] };
  }

  const candidates: ImportCandidate[] = [];
  const seenAddresses = new Set<string>();
  const graphSpecificNotes: string[] = [];

  function addCandidate(candidate: ImportCandidate): void {
    if (seenAddresses.has(candidate.resourceAddress)) {
      return;
    }
    seenAddresses.add(candidate.resourceAddress);
    candidates.push(candidate);
  }

  for (const file of files) {
    for (const graph of findGraphs(file.content, file.path)) {
      const nodes: Record<string, unknown> = {};
      for (const nodeId of graph.nodeIds) {
        const slug = slugifyIdentifier(nodeId, nodeId);
        nodes[slug] = { type: 'agent', agent: slug };
        addCandidate({
          resourceAddress: `agent.${slug}`,
          kind: 'agent',
          value: {
            role: 'assistant',
            instructions: {
              text: 'TODO: instructions were not recovered from source — fill in manually.',
            },
          },
          confidence: 0.25,
          detail: `Recognized a StateGraph node "${nodeId}"${graph.nodeHandlers.has(nodeId) ? ` (handler: ${graph.nodeHandlers.get(nodeId)})` : ''} in ${file.path}; node type defaulted to "agent" and was not actually verified.`,
        });
      }

      const entrypoint = graph.entrypoint ?? graph.nodeIds[0];
      if (!graph.entrypoint) {
        graphSpecificNotes.push(
          `No set_entry_point(...) was found for the graph in ${file.path} — the entrypoint was guessed as its first add_node call ("${entrypoint}").`,
        );
      }

      addCandidate({
        resourceAddress: `workflow.${graph.workflowId}`,
        kind: 'workflow',
        value: {
          entrypoint: slugifyIdentifier(entrypoint ?? 'entry', 'entry'),
          nodes,
          ...(graph.edges.length > 0
            ? {
                edges: graph.edges.map((edge) => ({
                  from: slugifyIdentifier(edge.from, edge.from),
                  to: slugifyIdentifier(edge.to, edge.to),
                })),
              }
            : {}),
        },
        confidence: 0.3,
        detail: `Recognized a StateGraph with ${graph.nodeIds.length} node(s) and ${graph.edges.length} edge(s) in ${file.path}.`,
      });
    }
  }

  return {
    recognized: true,
    candidates,
    unsupportedConstructs: [
      'Every node was defaulted to type "agent" — node handler functions were not analyzed, so tool/router/human-approval/loop nodes were not distinguished from plain agent nodes.',
      'Conditional routing (add_conditional_edges) was not recognized — only unconditional add_edge(...) calls were.',
      'Node handler function bodies (prompts, tool calls, control flow) were not translated.',
      ...graphSpecificNotes,
    ],
    manualActions: [
      'Review each node\'s actual type (agent/tool/router/humanApproval/...) against its handler function and correct the placeholder "agent" type where it\'s wrong.',
      "Fill in each agent's instructions, model, and tools by hand — import never recovers these from a handler function body.",
      'Recreate any conditional routing (add_conditional_edges) by hand using workflow edges\' "when" expressions.',
      'Run "agentform validate" and resolve whatever the schema/semantic checks flag before relying on this candidate specification.',
    ],
  };
}
