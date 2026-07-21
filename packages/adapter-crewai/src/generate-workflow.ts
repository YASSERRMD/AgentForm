import { generatedFileHeader, pythonStringLiteral, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type AgentformIR, type IRWorkflow } from '@agentform/ir';

interface AgentParticipant {
  readonly nodeId: string;
  readonly agentId: string;
}

/** `{file: ...}` instruction references are always pre-resolved to `{text: ...}` by IR time. */
function instructionsText(ir: AgentformIR, agentId: string): string {
  const agent = ir.agents.get(agentId);
  if (!agent) return '';
  return 'text' in agent.instructions ? agent.instructions.text : '';
}

/**
 * `terminate` nodes contribute no task of their own — they just mark where
 * the crew's work is expected to end; CrewAI's `Process.sequential`
 * finishes naturally once every declared task has run.
 */
function renderAgentParticipants(workflow: IRWorkflow): readonly AgentParticipant[] {
  const participants: AgentParticipant[] = [];
  for (const [nodeId, node] of workflow.nodes) {
    if (node.type === 'agent') {
      participants.push({ nodeId, agentId: node.agent });
    }
  }
  return participants;
}

/**
 * One workflow becomes one `build_crew() -> Crew` factory: `Process.sequential`
 * over one `Task` per agent node (declaration order), each task fed the
 * *previous* task as `context` — CrewAI's own documented mechanism for
 * passing prior output forward, verified end-to-end (a real two-task
 * `Crew.kickoff()` ran both tasks in order with the first task's output
 * available to the second). Each participating agent is constructed
 * exactly once into a local variable, reused for both its `Task.agent`
 * assignment and the `Crew(agents=[...])` list — constructing it twice via
 * two separate `build_x_agent()` calls would leave the crew's own
 * `agents=[...]` (which CrewAI's delegation tool reads to find coworkers)
 * pointing at different objects than the ones actually bound to tasks.
 *
 * Agentform has no separate "task" concept of its own, so each task's
 * `description` reuses that agent's own `instructions.text` — the one
 * piece of real, user-authored guidance Agentform has for it — rather than
 * a placeholder that would leave the crew doing nothing meaningful until
 * hand-edited; `expected_output` has no IR equivalent at all, so it stays
 * a generic, honest placeholder.
 *
 * `Process.hierarchical` (CrewAI's other built-in process) is deliberately
 * not used: it requires a `manager_llm`/`manager_agent` Agentform's
 * specification has no equivalent of, and inventing one would be
 * fabrication, not translation — the same reasoning every other adapter
 * applies to workflow constructs it can't faithfully derive from the IR.
 */
export function generateWorkflowFile(
  workflowId: string,
  workflow: IRWorkflow,
  ir: AgentformIR,
): string {
  const header = generatedFileHeader({
    commentPrefix: '#',
    sourceResourceAddresses: [resourceAddress('workflow', workflowId)],
  });

  const participants = renderAgentParticipants(workflow);

  if (participants.length === 0) {
    // Every workflow's graph is already validated to have a reachable
    // terminal path before generation runs, so a workflow with zero agent
    // participants isn't reachable via a real spec — kept as an explicit,
    // honest failure rather than emitting a function with nothing to call.
    return (
      `${header}\n\n` +
      `def build_crew():\n` +
      `    raise NotImplementedError(${pythonStringLiteral(`Workflow "${workflowId}" declares no agent participants.`)})\n`
    );
  }

  const agentIds = [...new Set(participants.map((participant) => participant.agentId))].sort();
  const importLines = [
    'from crewai import Crew, Process, Task',
    '',
    ...agentIds.map(
      (agentId) =>
        `from ..agents.${toIdentifier(agentId)} import build_${toIdentifier(agentId)}_agent`,
    ),
  ];

  const agentVar = (agentId: string): string => `${toIdentifier(agentId)}_agent`;
  const taskVar = (nodeId: string): string => `task_${toIdentifier(nodeId)}`;

  const agentLines = agentIds.map(
    (agentId) => `    ${agentVar(agentId)} = build_${toIdentifier(agentId)}_agent()`,
  );

  const taskLines = participants.map((participant, index) => {
    const previous = participants[index - 1];
    const contextArg =
      index > 0 && previous ? `,\n        context=[${taskVar(previous.nodeId)}]` : '';
    return (
      `    ${taskVar(participant.nodeId)} = Task(\n` +
      `        description=${JSON.stringify(instructionsText(ir, participant.agentId))},\n` +
      `        expected_output=${JSON.stringify('A complete, accurate response to the task described above.')},\n` +
      `        agent=${agentVar(participant.agentId)}${contextArg},\n` +
      `    )`
    );
  });

  const taskVars = participants.map((participant) => taskVar(participant.nodeId));

  return (
    `${header}\n\n` +
    `${importLines.join('\n')}\n\n\n` +
    `def build_crew() -> Crew:\n` +
    `    """Builds the "${workflowId}" workflow as a sequential CrewAI crew."""\n` +
    `${agentLines.join('\n')}\n\n` +
    `${taskLines.join('\n')}\n\n` +
    `    return Crew(\n` +
    `        agents=[${agentIds.map(agentVar).join(', ')}],\n` +
    `        tasks=[${taskVars.join(', ')}],\n` +
    `        process=Process.sequential,\n` +
    `    )\n`
  );
}
