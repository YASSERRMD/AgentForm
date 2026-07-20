export type ResourceId = string;

/** The `kind.identifier` address format used throughout plan output (§9) and diagnostics — e.g. `"agent.intake"`, `"model.primary"`. */
export function resourceAddress(kind: string, id: ResourceId): string {
  return `${kind}.${id}`;
}
