import { resolvePathWithinRoot } from '@agentform/core';
import type { FileSystem } from '@agentform/parser';
import type { DesignArtifact, DesignResourceType } from '@agentform/studio-design';
import type { FileWriter } from './file-writer.js';

/**
 * `resourceType`/`resourceId` reach here from a URL path — routes.ts
 * constrains both with Zod (resourceId against @agentform/schema's own
 * identifierSchema) before this ever runs, so a `../` traversal attempt
 * is already rejected as a 400. resolvePathWithinRoot is the backstop,
 * not the only gate — same defense-in-depth discipline as every other
 * file reference in this codebase since the Phase 12 path-traversal fix.
 */
function designRelativePath(resourceType: DesignResourceType, resourceId: string): string {
  return `design/${resourceType}.${resourceId}.afdesign.json`;
}

export function readDesignFile(
  rootDir: string,
  fs: FileSystem,
  resourceType: DesignResourceType,
  resourceId: string,
): DesignArtifact | null {
  const absolutePath = resolvePathWithinRoot(rootDir, designRelativePath(resourceType, resourceId));
  if (!fs.exists(absolutePath)) {
    return null;
  }
  return JSON.parse(fs.readFile(absolutePath)) as DesignArtifact;
}

export function writeDesignFile(
  rootDir: string,
  fileWriter: FileWriter,
  design: DesignArtifact,
): void {
  const absolutePath = resolvePathWithinRoot(
    rootDir,
    designRelativePath(design.binding.resourceType, design.binding.resourceId),
  );
  fileWriter.writeFile(absolutePath, `${JSON.stringify(design, null, 2)}\n`);
}
