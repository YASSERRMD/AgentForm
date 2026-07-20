import type { Diagnostic } from '@agentform/diagnostics';
import type { AgenticApplication } from '@agentform/schema';
import { validateReferences } from './references.js';
import { validateAllWorkflowGraphs } from './graph.js';
import { validateSubworkflows } from './subworkflow.js';
import { validateToolPermissions } from './permissions.js';
import { validateOutputReferences } from './outputs.js';

export { validateReferences } from './references.js';
export { validateWorkflowGraph, validateAllWorkflowGraphs } from './graph.js';
export { validateSubworkflows } from './subworkflow.js';
export { validateToolPermissions } from './permissions.js';
export { validateOutputReferences } from './outputs.js';

/** Runs every semantic check (§4 Phase 4's minimum-checks list) against a schema-valid document and returns every diagnostic found — never throws, never short-circuits on the first failing check. */
export function validateSemantics(application: AgenticApplication): Diagnostic[] {
  return [
    ...validateReferences(application),
    ...validateAllWorkflowGraphs(application),
    ...validateSubworkflows(application),
    ...validateToolPermissions(application),
    ...validateOutputReferences(application),
  ];
}
