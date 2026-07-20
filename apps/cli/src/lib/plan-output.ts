import type { PlanItem, PlanOperation } from '@agentform/planner';

const OPERATION_PREFIX: Readonly<Record<PlanOperation, string>> = {
  CREATE: '+',
  UPDATE: '~',
  REPLACE: '!',
  DELETE: '-',
  NO_OP: ' ',
  IMPORT: '+',
  READ: ' ',
};

const OPERATION_VERB: Readonly<Record<PlanOperation, string>> = {
  CREATE: 'will be created',
  UPDATE: 'will be updated',
  REPLACE: 'will be replaced',
  DELETE: 'will be destroyed',
  NO_OP: 'is unchanged',
  IMPORT: 'will be imported',
  READ: 'will be read',
};

/** Renders a plan matching §9's example output shape: a `+`/`~`/`!`/`-` prefixed line per changed resource (unchanged `NO_OP` resources are omitted, same as Terraform's convention), each with its reasons and risk indented beneath, then a one-line `create/change/destroy` summary. */
export function formatPlanForHumans(items: readonly PlanItem[]): string {
  const actionable = items.filter((item) => item.operation !== 'NO_OP');

  if (actionable.length === 0) {
    return 'No changes. The deployed state matches the specification.\n';
  }

  const lines: string[] = ['Agentform will perform the following actions:', ''];

  for (const item of actionable) {
    lines.push(
      `  ${OPERATION_PREFIX[item.operation]} ${item.resourceAddress} ${OPERATION_VERB[item.operation]}`,
    );
    for (const reason of item.reasons) {
      lines.push(`      ${reason}`);
    }
    if (item.requiresApproval) {
      lines.push(`      risk: ${item.risk} (requires explicit approval)`);
    } else if (item.risk === 'HIGH') {
      lines.push(`      risk: ${item.risk}`);
    }
    lines.push('');
  }

  lines.push(formatPlanSummary(actionable));
  return lines.join('\n');
}

export function formatPlanSummary(actionable: readonly PlanItem[]): string {
  let create = 0;
  let change = 0;
  let destroy = 0;
  for (const item of actionable) {
    if (item.operation === 'CREATE' || item.operation === 'IMPORT') {
      create += 1;
    } else if (item.operation === 'DELETE') {
      destroy += 1;
    } else {
      change += 1;
    }
  }
  return `Plan: ${create} to create, ${change} to change, ${destroy} to destroy.`;
}
