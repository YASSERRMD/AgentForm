import { toPascalCase } from '@agentform/compiler';

/** A valid camelCase C# local-variable/parameter name from an Agentform id — reuses `toPascalCase` (handles hyphens/underscores) then lowercases the first letter, matching C# naming convention for locals and parameters (as opposed to `PascalCase` for types/methods). */
export function toCamelCase(id: string): string {
  const pascal = toPascalCase(id);
  return pascal.length > 0 ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : pascal;
}
