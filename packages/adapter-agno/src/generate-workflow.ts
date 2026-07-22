import { generatedFileHeader, pythonStringLiteral, toIdentifier } from '@agentform/compiler';
import { parseDurationMs } from '@agentform/core';
import { resourceAddress, type IRWorkflow, type IRWorkflowNode } from '@agentform/ir';

interface StepCodegen {
  readonly expression: string;
  readonly inlineDefinitions: readonly string[];
  readonly agentImport?: string;
  readonly subworkflowImport?: string;
}

function pyId(value: string): string {
  return JSON.stringify(value);
}

/**
 * Renders one node as a real `agno.workflow.step.Step` (or, for `agent`/
 * `subworkflow`, a `Step(agent=...)`/`Step(workflow=...)` referencing an
 * already-generated builder). Every other node type's business logic is a
 * `raise NotImplementedError` stub — Agentform declares workflow
 * *structure*, never step implementation, the same discipline every
 * sibling adapter's tool/node bodies already follow.
 */
function renderStep(nodeId: string, node: IRWorkflowNode): StepCodegen {
  const stepFnName = `${toIdentifier(nodeId)}_step`;

  switch (node.type) {
    case 'agent': {
      const agentVar = `${toIdentifier(node.agent)}_agent`;
      return {
        expression: `Step(name=${pyId(nodeId)}, agent=build_${agentVar}())`,
        inlineDefinitions: [],
        agentImport: node.agent,
      };
    }
    case 'subworkflow': {
      const workflowVar = toIdentifier(node.workflow);
      return {
        expression: `Step(name=${pyId(nodeId)}, workflow=build_${workflowVar}_workflow())`,
        inlineDefinitions: [],
        subworkflowImport: node.workflow,
      };
    }
    case 'tool': {
      const def =
        `def ${stepFnName}(step_input: StepInput) -> StepOutput:\n` +
        `    """Node "${nodeId}" — TODO: call the "${node.tool}" tool directly and\n` +
        `    return its result. Agno tools are normally invoked by an agent's own\n` +
        `    reasoning, not called as a standalone workflow step, so this is a stub\n` +
        `    a human should fill in — see agno.tools.function.Function.entrypoint\n` +
        `    on the "${node.tool}" tool for the underlying callable.\n` +
        `    """\n` +
        `    raise NotImplementedError(${pythonStringLiteral(`Node "${nodeId}" (tool "${node.tool}") is not yet implemented.`)})\n`;
      return {
        expression: `Step(name=${pyId(nodeId)}, executor=${stepFnName})`,
        inlineDefinitions: [def],
      };
    }
    case 'humanApproval': {
      const approverNote =
        node.approvers && node.approvers.length > 0
          ? `\n    Approvers: ${node.approvers.join(', ')}`
          : '';
      const def =
        `def ${stepFnName}(step_input: StepInput) -> StepOutput:\n` +
        `    """Node "${nodeId}" — passthrough executor; requires_confirmation=True${approverNote}\n` +
        `    below is what actually pauses this step for human approval (Agno's\n` +
        `    real, blocking human-in-the-loop gate — verified against the\n` +
        `    installed package).\n` +
        `    """\n` +
        `    return StepOutput(content=step_input.previous_step_content)\n`;
      return {
        expression:
          `Step(\n` +
          `        name=${pyId(nodeId)},\n` +
          `        executor=${stepFnName},\n` +
          `        requires_confirmation=True,\n` +
          `        confirmation_message=${pythonStringLiteral(`Approve node "${nodeId}"?`)},\n` +
          `    )`,
        inlineDefinitions: [def],
      };
    }
    case 'transform': {
      const def =
        `def ${stepFnName}(step_input: StepInput) -> StepOutput:\n` +
        `    """Node "${nodeId}" — transform expression: ${node.expression}\n\n` +
        `    TODO: Agentform's expression strings have no evaluator anywhere in\n` +
        `    this codebase by design (see the workflow schema's own doc comment on\n` +
        `    \`expression\`/\`when\`) — implement the real transform here.\n` +
        `    """\n` +
        `    raise NotImplementedError(${pythonStringLiteral(`Node "${nodeId}" transform is not yet implemented.`)})\n`;
      return {
        expression: `Step(name=${pyId(nodeId)}, executor=${stepFnName})`,
        inlineDefinitions: [def],
      };
    }
    case 'delay': {
      const seconds = parseDurationMs(node.duration) / 1000;
      const def =
        `def ${stepFnName}(step_input: StepInput) -> StepOutput:\n` +
        `    """Node "${nodeId}" — waits ${node.duration} before continuing."""\n` +
        `    time.sleep(${seconds})\n` +
        `    return StepOutput(content=step_input.previous_step_content)\n`;
      return {
        expression: `Step(name=${pyId(nodeId)}, executor=${stepFnName})`,
        inlineDefinitions: [def],
      };
    }
    case 'terminate': {
      const reasonNote = node.reason ? `\n\n    Reason: ${node.reason}` : '';
      const def =
        `def ${stepFnName}(step_input: StepInput) -> StepOutput:\n` +
        `    """Node "${nodeId}" — terminal step.${reasonNote}\n    """\n` +
        `    return StepOutput(content=step_input.previous_step_content)\n`;
      return {
        expression: `Step(name=${pyId(nodeId)}, executor=${stepFnName})`,
        inlineDefinitions: [def],
      };
    }
    default:
      // router/loop/parallel/condition are rendered by their own dedicated
      // functions below (renderRouter/renderLoop/renderParallel/renderCondition),
      // never reached through this generic per-node path; every other type is
      // reported unsupported by compatibility.ts, and compile() never calls
      // generate() while a blocking incompatibility exists.
      throw new Error(`generate-workflow: unexpected node type "${node.type}" on node "${nodeId}"`);
  }
}

/**
 * Resolves one "child" reference (a `parallel` branch, a `router` choice, a
 * `condition` then/else target) to a real Step expression when the target
 * is a directly-supported leaf type (`agent`/`tool`/`humanApproval`/
 * `terminate`/`transform`/`delay`/`subworkflow`); a target that's itself
 * `loop`/`parallel`/`router`/`condition` (nested control flow) gets a
 * named stub rather than deep recursive resolution — bounded, honest scope
 * matching every sibling adapter's "well-scoped basic translation, not
 * full graph fidelity in one pass" precedent.
 */
function renderChildStep(childId: string, workflow: IRWorkflow): StepCodegen {
  const childNode = workflow.nodes.get(childId);
  if (!childNode) {
    const stepFnName = `${toIdentifier(childId)}_missing_step`;
    return {
      expression: `Step(name=${pyId(childId)}, executor=${stepFnName})`,
      inlineDefinitions: [
        `def ${stepFnName}(step_input: StepInput) -> StepOutput:\n` +
          `    raise NotImplementedError(${pythonStringLiteral(`Node "${childId}" was referenced but not found.`)})\n`,
      ],
    };
  }
  if (['loop', 'parallel', 'router', 'condition'].includes(childNode.type)) {
    const stepFnName = `${toIdentifier(childId)}_nested_step`;
    return {
      expression: `Step(name=${pyId(childId)}, executor=${stepFnName})`,
      inlineDefinitions: [
        `def ${stepFnName}(step_input: StepInput) -> StepOutput:\n` +
          `    """TODO: node "${childId}" is itself a "${childNode.type}" control-flow node —\n` +
          `    nested control flow more than one level deep isn't generated\n` +
          `    automatically; wire the real ${childNode.type} construct here by hand.\n` +
          `    """\n` +
          `    raise NotImplementedError(${pythonStringLiteral(`Nested "${childNode.type}" node "${childId}" needs manual implementation.`)})\n`,
      ],
    };
  }
  return renderStep(childId, childNode);
}

function renderComposite(nodeId: string, node: IRWorkflowNode, workflow: IRWorkflow): StepCodegen {
  const outgoing = workflow.edges.filter((edge) => edge.from === nodeId);
  const imports: string[] = [];
  const inlineDefinitions: string[] = [];

  function collect(codegens: readonly StepCodegen[]): string[] {
    const expressions: string[] = [];
    for (const codegen of codegens) {
      expressions.push(codegen.expression);
      inlineDefinitions.push(...codegen.inlineDefinitions);
      if (codegen.agentImport) imports.push(codegen.agentImport);
      if (codegen.subworkflowImport) imports.push(codegen.subworkflowImport);
    }
    return expressions;
  }

  if (node.type === 'parallel') {
    const branchIds = node.branches ?? [];
    const branchExpressions = collect(branchIds.map((id) => renderChildStep(id, workflow)));
    const args = [...branchExpressions, `name=${pyId(nodeId)}`];
    return {
      expression: `Parallel(\n        ${args.join(',\n        ')},\n    )`,
      inlineDefinitions,
      agentImport: imports.find(() => false),
    };
  }

  if (node.type === 'router') {
    const choiceExpressions = collect(outgoing.map((edge) => renderChildStep(edge.to, workflow)));
    const selectorFnName = `${toIdentifier(nodeId)}_selector`;
    const declared = outgoing
      .map((edge) => (edge.when ? `"${edge.to}" when: ${edge.when}` : `"${edge.to}" (default)`))
      .join('; ');
    inlineDefinitions.push(
      `def ${selectorFnName}(step_input: StepInput) -> list:\n` +
        `    """Router "${nodeId}" — declared choices: ${declared || 'none'}.\n\n` +
        `    TODO: implement real routing logic. Must return a list of the chosen\n` +
        `    Step object(s) from this Router's own \`choices\`.\n` +
        `    """\n` +
        `    raise NotImplementedError(${pythonStringLiteral(`Node "${nodeId}" routing logic is not yet implemented.`)})\n`,
    );
    return {
      expression:
        `Router(\n` +
        `        name=${pyId(nodeId)},\n` +
        `        choices=[${choiceExpressions.join(', ')}],\n` +
        `        selector=${selectorFnName},\n` +
        `    )`,
      inlineDefinitions,
    };
  }

  if (node.type === 'condition') {
    const [thenEdge, elseEdge] = outgoing;
    const thenExpressions = thenEdge ? collect([renderChildStep(thenEdge.to, workflow)]) : [];
    const elseExpressions = elseEdge ? collect([renderChildStep(elseEdge.to, workflow)]) : [];
    const evaluatorFnName = `${toIdentifier(nodeId)}_evaluator`;
    inlineDefinitions.push(
      `def ${evaluatorFnName}(step_input: StepInput) -> bool:\n` +
        `    """Condition "${nodeId}" — expression: ${node.expression}\n\n` +
        `    TODO: Agentform's expression strings have no evaluator anywhere in\n` +
        `    this codebase by design — implement the real check here.\n` +
        `    """\n` +
        `    raise NotImplementedError(${pythonStringLiteral(`Node "${nodeId}" condition is not yet implemented.`)})\n`,
    );
    const args = [
      `name=${pyId(nodeId)}`,
      `evaluator=${evaluatorFnName}`,
      `steps=[${thenExpressions.join(', ')}]`,
      elseExpressions.length > 0 ? `else_steps=[${elseExpressions.join(', ')}]` : undefined,
    ].filter((arg): arg is string => arg !== undefined);
    return {
      expression: `Condition(\n        ${args.join(',\n        ')},\n    )`,
      inlineDefinitions,
    };
  }

  // loop
  if (node.type === 'loop') {
    const bodyStepFnName = `${toIdentifier(nodeId)}_body_step`;
    const endConditionFnName = `${toIdentifier(nodeId)}_end_condition`;
    inlineDefinitions.push(
      `def ${bodyStepFnName}(step_input: StepInput) -> StepOutput:\n` +
        `    """Loop "${nodeId}" body (max_iterations=${node.maxIterations}).\n\n` +
        `    TODO: the real loop body is application logic — Agentform's graph\n` +
        `    edges into/out of a loop node describe *that a cycle exists*, not a\n` +
        `    reconstructable step-by-step body, so it isn't generated automatically.\n` +
        `    """\n` +
        `    raise NotImplementedError(${pythonStringLiteral(`Loop "${nodeId}" body is not yet implemented.`)})\n`,
    );
    const loopArgs = [
      `name=${pyId(nodeId)}`,
      `steps=[${bodyStepFnName}]`,
      `max_iterations=${node.maxIterations}`,
    ];
    if (node.condition) {
      inlineDefinitions.push(
        `def ${endConditionFnName}(outputs: list) -> bool:\n` +
          `    """Loop "${nodeId}" end condition: ${node.condition}\n\n` +
          `    TODO: no expression evaluator exists anywhere in Agentform — implement\n` +
          `    the real check here.\n` +
          `    """\n` +
          `    raise NotImplementedError(${pythonStringLiteral(`Loop "${nodeId}" end condition is not yet implemented.`)})\n`,
      );
      loopArgs.push(`end_condition=${endConditionFnName}`);
    }
    return {
      expression: `Loop(\n        ${loopArgs.join(',\n        ')},\n    )`,
      inlineDefinitions,
    };
  }

  throw new Error(
    `generate-workflow: renderComposite called on unexpected node type "${node.type}"`,
  );
}

/**
 * Nodes "consumed" as a nested child of a `parallel`/`router`/`condition`
 * node — these must not also appear as their own top-level step, or the
 * generated workflow would run them twice with different semantics (once
 * standalone, once nested). `loop` intentionally consumes nothing (its
 * body is a documented stub, never a real reference into the graph — see
 * `renderComposite`), so a loop's cyclic neighbor nodes remain in the
 * top-level sequence, generated as their own steps; this is a known,
 * documented scope limit (see this file's own module doc comment) rather
 * than an attempt at full loop-body graph reconstruction.
 */
function consumedNodeIds(workflow: IRWorkflow): ReadonlySet<string> {
  const consumed = new Set<string>();
  for (const [nodeId, node] of workflow.nodes) {
    if (node.type === 'parallel') {
      for (const branchId of node.branches ?? []) {
        consumed.add(branchId);
      }
    } else if (node.type === 'router' || node.type === 'condition') {
      for (const edge of workflow.edges) {
        if (edge.from === nodeId) {
          consumed.add(edge.to);
        }
      }
    }
  }
  return consumed;
}

/**
 * Pre-order depth-first walk from `workflow.entrypoint`, visiting each node
 * exactly once. Unlike a global topological sort (Kahn's algorithm), this
 * never gets stuck: when the entrypoint itself sits inside a cycle (a loop
 * node in the entrypoint's own SCC), a global topological sort finds
 * *every* node unplaceable, since none of them ever reaches in-degree zero
 * — verified directly, this was a real bug caught by this adapter's own
 * test suite before switching to this traversal. Starting from a
 * known-good root and simply skipping already-visited targets sidesteps
 * that failure mode entirely.
 *
 * `backEdges` uses the standard three-color (white/gray/black) DFS state
 * `@agentform/core`'s own `findCycle` already uses, specifically to avoid
 * a real bug this function had during development: a plain "already
 * visited?" check conflates a genuine cycle-closing back-edge (the target
 * is a *current ancestor* on the DFS stack — `'visiting'`) with ordinary
 * DAG convergence (the target was already fully explored via a different,
 * earlier path — `'done'` — completely normal, e.g. two router choices
 * both leading to the same next node, not a cycle at all). Only the
 * former is reported.
 */
function walkFromEntrypoint(workflow: IRWorkflow): {
  readonly order: readonly string[];
  readonly backEdges: readonly { readonly from: string; readonly to: string }[];
} {
  const edgesByFrom = new Map<string, string[]>();
  for (const edge of workflow.edges) {
    const list = edgesByFrom.get(edge.from) ?? [];
    list.push(edge.to);
    edgesByFrom.set(edge.from, list);
  }

  const state = new Map<string, 'visiting' | 'done'>();
  const order: string[] = [];
  const backEdges: { from: string; to: string }[] = [];

  function visit(nodeId: string): void {
    if (state.has(nodeId)) {
      return;
    }
    state.set(nodeId, 'visiting');
    order.push(nodeId);
    for (const targetId of edgesByFrom.get(nodeId) ?? []) {
      if (state.get(targetId) === 'visiting') {
        backEdges.push({ from: nodeId, to: targetId });
      } else if (!state.has(targetId)) {
        visit(targetId);
      }
    }
    state.set(nodeId, 'done');
  }

  if (workflow.nodes.has(workflow.entrypoint)) {
    visit(workflow.entrypoint);
  }
  // Every node is reachable from the entrypoint per semantic validation
  // (AGF3005), so this is normally a no-op — kept only so a node this
  // function's own caller adds later never gets silently dropped.
  for (const nodeId of workflow.nodes.keys()) {
    visit(nodeId);
  }

  return { order, backEdges };
}

/**
 * One workflow becomes one `build_<id>_workflow() -> Workflow` function
 * assembling a real `agno.workflow.Workflow(steps=[...])` (verified
 * against the installed package — every construct below, including the
 * full assembly with all node types mixed together, was actually
 * constructed successfully, not just signature-checked).
 *
 * Agentform's workflow model is a general graph (nodes + edges, with
 * cycles allowed only through `loop` nodes); Agno's own model is
 * fundamentally an ordered sequence of steps with structured nesting
 * (`Loop`/`Parallel`/`Condition`/`Router`), not an arbitrary graph — the
 * same shape of impedance mismatch every Python adapter in this compiler
 * has (CrewAI's own compatibility.ts documents an equivalent limitation
 * for `Process.sequential`). This generator resolves it by: walking the
 * graph in pre-order DFS from the entrypoint (`walkFromEntrypoint`, which
 * naturally never revisits a node even through a loop's back-edge), then
 * removing any node "consumed" as a nested child of a
 * `parallel`/`router`/`condition` node (`consumedNodeIds`) so it isn't
 * emitted twice — the remaining nodes become the top-level
 * `Workflow.steps` list, in that order.
 */
export function generateWorkflowFile(workflowId: string, workflow: IRWorkflow): string {
  const header = generatedFileHeader({
    commentPrefix: '#',
    sourceResourceAddresses: [resourceAddress('workflow', workflowId)],
  });

  const { order, backEdges } = walkFromEntrypoint(workflow);
  const consumed = consumedNodeIds(workflow);

  const topLevelIds = order.filter((id) => !consumed.has(id));

  const agentImports = new Set<string>();
  const subworkflowImports = new Set<string>();
  const inlineDefinitions: string[] = [];
  let usesTime = false;

  const stepExpressions = topLevelIds.map((nodeId) => {
    const node = workflow.nodes.get(nodeId)!;
    const codegen = ['loop', 'parallel', 'router', 'condition'].includes(node.type)
      ? renderComposite(nodeId, node, workflow)
      : renderStep(nodeId, node);
    inlineDefinitions.push(...codegen.inlineDefinitions);
    if (codegen.agentImport) agentImports.add(codegen.agentImport);
    if (codegen.subworkflowImport) subworkflowImports.add(codegen.subworkflowImport);
    if (node.type === 'delay') usesTime = true;
    return codegen.expression;
  });

  // renderComposite's nested renderChildStep calls can also introduce agent/
  // subworkflow imports and a `delay` child, which the loop above (over
  // top-level ids only) wouldn't see — re-scan every inline definition's
  // source text is unnecessary since renderComposite already folds those
  // into its own returned codegen.inlineDefinitions; agent/subworkflow
  // imports from *nested* children need a second pass over topLevelIds'
  // composite nodes specifically.
  for (const nodeId of topLevelIds) {
    const node = workflow.nodes.get(nodeId)!;
    if (node.type !== 'parallel' && node.type !== 'router' && node.type !== 'condition') {
      continue;
    }
    const childIds =
      node.type === 'parallel'
        ? (node.branches ?? [])
        : workflow.edges.filter((edge) => edge.from === nodeId).map((edge) => edge.to);
    for (const childId of childIds) {
      const childNode = workflow.nodes.get(childId);
      if (childNode?.type === 'agent') agentImports.add(childNode.agent);
      if (childNode?.type === 'subworkflow') subworkflowImports.add(childNode.workflow);
    }
  }

  const cyclicNote =
    backEdges.length > 0
      ? [
          `# The following edge(s) close a cycle back to an already-visited node`,
          `# (a loop's own back-edge) and are not represented as a transition`,
          `# between two top-level Steps below — the loop node's own Loop(...)`,
          `# construct is what represents the cycle; see this file's own module`,
          `# doc comment:`,
          ...backEdges.map((edge) => `#   ${edge.from} -> ${edge.to}`),
        ].join('\n') + '\n\n'
      : '';

  const importLines = [
    `from agno.workflow import Condition, Loop, Parallel, Router, Step, StepInput, StepOutput, Workflow`,
    usesTime ? 'import time' : undefined,
    '',
    ...[...agentImports]
      .sort()
      .map(
        (agentId) =>
          `from ..agents.${toIdentifier(agentId)} import build_${toIdentifier(agentId)}_agent`,
      ),
    ...[...subworkflowImports]
      .sort()
      .map((subId) => `from .${toIdentifier(subId)} import build_${toIdentifier(subId)}_workflow`),
  ].filter((line): line is string => line !== undefined);

  const stepsList = stepExpressions.map((expr) => `        ${expr},`).join('\n');

  return (
    `${header}\n\n` +
    `${importLines.join('\n')}\n\n\n` +
    `${cyclicNote}` +
    `${inlineDefinitions.join('\n\n')}\n\n` +
    `def build_${toIdentifier(workflowId)}_workflow() -> Workflow:\n` +
    `    """Builds the "${workflowId}" workflow."""\n` +
    `    return Workflow(\n` +
    `        name=${pyId(workflowId)},\n` +
    `        steps=[\n${stepsList}\n        ],\n` +
    `    )\n`
  );
}
