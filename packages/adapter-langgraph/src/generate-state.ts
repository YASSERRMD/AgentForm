import { generatedFileHeader, toIdentifier } from '@agentform/compiler';
import type { AgentformIR } from '@agentform/ir';

export interface LoopCounterField {
  readonly fieldName: string;
  readonly workflowId: string;
  readonly nodeId: string;
  readonly maxIterations: number;
}

/** The one formula for naming a loop node's iteration-counter state field — shared with `generate-workflow.ts` so a loop node's body always reads/writes the exact field `state.py` declares. */
export function loopCounterFieldName(workflowId: string, nodeId: string): string {
  return toIdentifier(`${workflowId}_${nodeId}_iterations`);
}

/**
 * One counter field per `loop` node, across every workflow (mirrors
 * `@agentform/adapter-openai`'s `collectGuardrailNames` — collected across
 * the whole IR into one shared file rather than per-workflow). Prefixed
 * with the workflow id since node ids are only unique within a workflow,
 * not across the whole application. This is what makes "Loop limit" a real,
 * enforceable mechanism rather than just a comment: the loop's path
 * function (see `generate-workflow.ts`) is expected to stop looping once
 * this counter reaches `maxIterations`.
 */
export function collectLoopCounterFields(ir: AgentformIR): readonly LoopCounterField[] {
  const fields: LoopCounterField[] = [];
  for (const [workflowId, workflow] of ir.workflows) {
    for (const [nodeId, node] of workflow.nodes) {
      if (node.type === 'loop') {
        fields.push({
          fieldName: loopCounterFieldName(workflowId, nodeId),
          workflowId,
          nodeId,
          maxIterations: node.maxIterations,
        });
      }
    }
  }
  return [...fields].sort((a, b) => a.fieldName.localeCompare(b.fieldName));
}

/**
 * The single shared graph state (`state.py`, §13.2's required layout) —
 * `messages` using the verified-real `Annotated[list, add_messages]`
 * pattern (`langgraph.graph.message.add_messages`), plus one `int` counter
 * per loop node so generated loop-continuation checks have somewhere real
 * to read/write iteration counts.
 */
export function generateStateFile(ir: AgentformIR): string {
  const header = generatedFileHeader({ commentPrefix: '#' });
  const loopFields = collectLoopCounterFields(ir);
  const fieldLines = loopFields.map((field) => `    ${field.fieldName}: int`).join('\n');

  return (
    `${header}\n\n` +
    `from typing import Annotated, TypedDict\n\n` +
    `from langgraph.graph.message import add_messages\n\n\n` +
    `class State(TypedDict):\n` +
    `    """Shared graph state. Extend with additional fields as needed."""\n\n` +
    `    messages: Annotated[list, add_messages]\n` +
    (fieldLines.length > 0 ? `${fieldLines}\n` : '')
  );
}
