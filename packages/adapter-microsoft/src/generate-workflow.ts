import { generatedFileHeader, toPascalCase } from '@agentform/compiler';
import { resourceAddress, type AgentformIR, type IRWorkflow } from '@agentform/ir';
import { agentClassName, agentLocalName } from './generate-agent.js';

/** `GeneratedApp.Agents.<ClassName>` — every reference to a generated agent class in this file is fully qualified rather than via a `using GeneratedApp.Agents;` import, so this stays the single place that convention lives. */
function qualifiedAgentClassName(agentId: string): string {
  return `GeneratedApp.Agents.${agentClassName(agentId)}`;
}

interface AgentParticipant {
  readonly nodeId: string;
  readonly agentId: string;
}

/** `terminate` nodes contribute no participant of its own — a handoff/sequential workflow simply finishes once its agents are done. */
function renderAgentParticipants(workflow: IRWorkflow): readonly AgentParticipant[] {
  const participants: AgentParticipant[] = [];
  for (const [nodeId, node] of workflow.nodes) {
    if (node.type === 'agent') {
      participants.push({ nodeId, agentId: node.agent });
    }
  }
  return participants;
}

/** Whether `generateWorkflowFile` emits a plain `AIAgent Build()` (one participant — no orchestration overhead needed) or a `Workflow Build()` (two or more) — `generate-project-files.ts`'s `Program.cs` generator needs to know which call shape to emit per workflow, the same reason `@agentform/adapter-autogen` exports `isSingleAgentWorkflow`. */
export function isSingleAgentWorkflow(workflow: IRWorkflow): boolean {
  return renderAgentParticipants(workflow).length === 1;
}

/**
 * Whether a multi-agent workflow uses `HandoffWorkflowBuilder` (at least
 * one participant declares a `delegation.allowedAgents` target that is
 * itself a participant in this same workflow) or plain
 * `AgentWorkflowBuilder.BuildSequential` (no declared delegation among
 * participants at all). Mirrors `computeHandoffReachability` in
 * `compatibility.ts` in spirit, but this only decides *which builder to
 * use* — by the time `generate()` runs, `compile()`'s compatibility gate
 * has already blocked any IR where a declared delegation source would be
 * unreachable from the entrypoint (a real `HandoffWorkflowBuilder.Build()`
 * `InvalidOperationException`, verified directly), so this function (and
 * the codegen below) doesn't need to re-check reachability itself — same
 * trust boundary `@agentform/adapter-google-adk` relies on for its own
 * shared-delegation-target hazard.
 */
function usesHandoff(participants: readonly AgentParticipant[], ir: AgentformIR): boolean {
  const participantIds = new Set(participants.map((p) => p.agentId));
  return participants.some((p) =>
    (ir.agents.get(p.agentId)?.delegation?.allowedAgents ?? []).some((target) =>
      participantIds.has(target),
    ),
  );
}

/**
 * One workflow becomes one static class exposing a `Build()` factory:
 * a bare `AIAgent` for a single participant, a real
 * `HandoffWorkflowBuilder`-built `Workflow` when delegation is declared
 * among participants (verified end-to-end: `CreateHandoffBuilderWith`,
 * `.WithHandoffs([source], target)` per declared edge, `.EnableReturnToPrevious()`,
 * `.Build()`), or a plain `AgentWorkflowBuilder.BuildSequential([...])`
 * `Workflow` otherwise (declaration order). `Process.hierarchical`-style
 * invention (a manager agent Agentform's specification has no equivalent
 * of) is avoided the same way every other adapter avoids fabricating
 * workflow constructs the IR doesn't declare.
 */
export function generateWorkflowFile(
  workflowId: string,
  workflow: IRWorkflow,
  ir: AgentformIR,
): string {
  const header = generatedFileHeader({
    commentPrefix: '//',
    sourceResourceAddresses: [resourceAddress('workflow', workflowId)],
  });
  const className = `${toPascalCase(workflowId)}Workflow`;

  const participants = renderAgentParticipants(workflow);

  if (participants.length === 0) {
    return (
      `${header}\n\n` +
      `namespace GeneratedApp.Workflows;\n\n` +
      `public static class ${className}\n` +
      `{\n` +
      `    public static Microsoft.Agents.AI.AIAgent Build()\n` +
      `    {\n` +
      `        throw new NotImplementedException(${JSON.stringify(`Workflow "${workflowId}" declares no agent participants.`)});\n` +
      `    }\n` +
      `}\n`
    );
  }

  if (participants.length === 1) {
    const only = participants[0];
    if (!only) throw new Error('unreachable: participants.length === 1');
    return (
      `${header}\n\n` +
      `using Microsoft.Agents.AI;\n\n` +
      `namespace GeneratedApp.Workflows;\n\n` +
      `public static class ${className}\n` +
      `{\n` +
      `    public static AIAgent Build() => ${qualifiedAgentClassName(only.agentId)}.Build();\n` +
      `}\n`
    );
  }

  const agentDeclarations = participants
    .map(
      (p) =>
        `        AIAgent ${agentLocalName(p.agentId)} = ${qualifiedAgentClassName(p.agentId)}.Build();`,
    )
    .join('\n');

  if (usesHandoff(participants, ir)) {
    const participantIds = new Set(participants.map((p) => p.agentId));
    const entrypointNode = workflow.nodes.get(workflow.entrypoint);
    const entrypointAgentId =
      entrypointNode && entrypointNode.type === 'agent'
        ? entrypointNode.agent
        : participants[0]?.agentId;
    if (!entrypointAgentId) throw new Error('unreachable: participants.length > 1');

    const handoffLines = participants
      .flatMap((p) => {
        const targets = (ir.agents.get(p.agentId)?.delegation?.allowedAgents ?? []).filter((t) =>
          participantIds.has(t),
        );
        return targets.map(
          (target) =>
            `        builder.WithHandoffs([${agentLocalName(p.agentId)}], ${agentLocalName(target)});`,
        );
      })
      .join('\n');

    return (
      `${header}\n\n` +
      `using Microsoft.Agents.AI;\n` +
      `using Microsoft.Agents.AI.Workflows;\n\n` +
      `namespace GeneratedApp.Workflows;\n\n` +
      `public static class ${className}\n` +
      `{\n` +
      `    public static Workflow Build()\n` +
      `    {\n` +
      `${agentDeclarations}\n\n` +
      `        HandoffWorkflowBuilder builder = AgentWorkflowBuilder.CreateHandoffBuilderWith(${agentLocalName(entrypointAgentId)});\n` +
      `${handoffLines}\n` +
      `        builder.EnableReturnToPrevious();\n` +
      `        return builder.Build();\n` +
      `    }\n` +
      `}\n`
    );
  }

  const participantVars = participants.map((p) => agentLocalName(p.agentId)).join(', ');
  return (
    `${header}\n\n` +
    `using Microsoft.Agents.AI;\n` +
    `using Microsoft.Agents.AI.Workflows;\n\n` +
    `namespace GeneratedApp.Workflows;\n\n` +
    `public static class ${className}\n` +
    `{\n` +
    `    public static Workflow Build()\n` +
    `    {\n` +
    `${agentDeclarations}\n\n` +
    `        return AgentWorkflowBuilder.BuildSequential([${participantVars}]);\n` +
    `    }\n` +
    `}\n`
  );
}
