import { generatedFileHeader, pythonStringLiteral, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type IRWorkflow } from '@agentform/ir';

interface Participant {
  readonly nodeId: string;
  readonly constructExpression: string;
  readonly agentImport?: string;
  readonly inlineDefinition?: string;
}

/**
 * `terminate` nodes contribute no participant of its own — AutoGen's Team
 * model has no explicit "end" node, only termination *conditions* — so it's
 * simply skipped. Every other supported node type (`agent`, `humanApproval`)
 * becomes one team participant.
 */
export function renderParticipants(workflow: IRWorkflow): readonly Participant[] {
  const participants: Participant[] = [];
  for (const [nodeId, node] of workflow.nodes) {
    if (node.type === 'agent') {
      participants.push({
        nodeId,
        constructExpression: `build_${toIdentifier(node.agent)}_agent()`,
        agentImport: node.agent,
      });
    } else if (node.type === 'humanApproval') {
      const fnName = `${toIdentifier(nodeId)}_input`;
      const docLines = [`Human approval node "${nodeId}".`, ''];
      if (node.approvers && node.approvers.length > 0) {
        docLines.push(`Approvers: ${node.approvers.join(', ')}`, '');
      }
      docLines.push(
        'TODO: replace with real human input collection (a console prompt, a',
        'Slack message, a web UI callback, ...) — this stub always raises.',
      );
      const docstring = docLines.map((line) => (line.length > 0 ? `    ${line}` : '')).join('\n');
      const inlineDefinition =
        `async def ${fnName}(prompt: str, cancellation_token: CancellationToken | None = None) -> str:\n` +
        `    """\n${docstring}\n    """\n` +
        `    raise NotImplementedError(${pythonStringLiteral(`TODO: implement human input collection for node "${nodeId}".`)})\n`;
      participants.push({
        nodeId,
        constructExpression: `UserProxyAgent(name=${JSON.stringify(toIdentifier(nodeId))}, input_func=${fnName})`,
        inlineDefinition,
      });
    }
  }
  return participants;
}

/** Whether `generateWorkflowFile` will emit a plain `run(task)` function (a single agent participant, no team) rather than `build_team()` — `generate-project-files.ts`'s `main.py` generator needs to know which call shape to emit per workflow. */
export function isSingleAgentWorkflow(workflow: IRWorkflow): boolean {
  const participants = renderParticipants(workflow);
  return participants.length === 1 && participants[0]?.agentImport !== undefined;
}

/**
 * One workflow becomes either a single agent's `run(task)` function (no
 * team overhead when there's only one participant) or a
 * `build_team() -> RoundRobinGroupChat` function. Every team **always**
 * gets a real termination condition — verified gotcha: a `RoundRobinGroupChat`
 * built with neither `termination_condition` nor `max_turns` is accepted
 * silently at construction and then loops turn after turn indefinitely
 * against a real model client (only stopped in testing because the fake
 * replay client ran out of canned responses) — so a safety-net
 * `MaxMessageTermination` is unconditional here, not optional.
 */
export function generateWorkflowFile(workflowId: string, workflow: IRWorkflow): string {
  const header = generatedFileHeader({
    commentPrefix: '#',
    sourceResourceAddresses: [resourceAddress('workflow', workflowId)],
  });

  const participants = renderParticipants(workflow);

  if (participants.length === 0) {
    // Every workflow's graph is already validated to have a reachable
    // terminal path before generation runs, so this is unreachable via a
    // real spec (a workflow with only a `terminate` node isn't valid — it
    // needs a declared entrypoint node too) — kept as an explicit,
    // honest failure rather than emitting a function with nothing to call.
    return (
      `${header}\n\n` +
      `def run() -> None:\n` +
      `    raise NotImplementedError(${pythonStringLiteral(`Workflow "${workflowId}" declares no agent or human-approval participants.`)})\n`
    );
  }

  if (participants.length === 1 && participants[0]?.agentImport) {
    const only = participants[0];
    const importLine = `from ..agents.${toIdentifier(only.agentImport as string)} import build_${toIdentifier(only.agentImport as string)}_agent`;
    return (
      `${header}\n\n` +
      `${importLine}\n\n\n` +
      `async def run(task: str) -> str:\n` +
      `    """Runs the "${workflowId}" workflow (a single agent, no team needed).\n\n` +
      `    TODO: once you've implemented a real model client (see\n` +
      `    src/models/), remember to close it when your program exits —\n` +
      `    e.g. \`await client.close()\` — see AutoGen's model client docs.\n` +
      `    """\n` +
      `    agent = ${only.constructExpression}\n` +
      `    result = await agent.run(task=task)\n` +
      `    return result.messages[-1].content\n`
    );
  }

  const agentImports = new Set<string>();
  let usesUserProxy = false;
  const inlineDefinitions: string[] = [];
  for (const participant of participants) {
    if (participant.agentImport) agentImports.add(participant.agentImport);
    if (participant.inlineDefinition) {
      usesUserProxy = true;
      inlineDefinitions.push(participant.inlineDefinition);
    }
  }

  const importLines = [
    'from autogen_agentchat.conditions import MaxMessageTermination, TextMentionTermination',
    'from autogen_agentchat.teams import RoundRobinGroupChat',
    usesUserProxy ? 'from autogen_agentchat.agents import UserProxyAgent' : undefined,
    usesUserProxy ? 'from autogen_core import CancellationToken' : undefined,
    '',
    ...[...agentImports]
      .sort()
      .map(
        (agentId) =>
          `from ..agents.${toIdentifier(agentId)} import build_${toIdentifier(agentId)}_agent`,
      ),
  ].filter((line): line is string => line !== undefined);

  const participantLines = participants
    .map((participant) => `        ${participant.constructExpression},`)
    .join('\n');

  return (
    `${header}\n\n` +
    `${importLines.join('\n')}\n\n\n` +
    (inlineDefinitions.length > 0 ? `${inlineDefinitions.join('\n\n')}\n\n` : '') +
    `def build_team() -> RoundRobinGroupChat:\n` +
    `    """Builds the "${workflowId}" workflow team.\n\n` +
    `    Call \`await team.run(task=...)\` (or \`run_stream\`) to execute it.\n` +
    `    TODO: once you've implemented real model clients (see src/models/),\n` +
    `    remember to close each one when your program exits.\n` +
    `    """\n` +
    `    participants = [\n${participantLines}\n    ]\n` +
    `    return RoundRobinGroupChat(\n` +
    `        participants=participants,\n` +
    `        termination_condition=MaxMessageTermination(10) | TextMentionTermination("TERMINATE"),\n` +
    `    )\n`
  );
}
