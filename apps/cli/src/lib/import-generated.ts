import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { walkSourceFiles } from '@agentform/core';
import type { ImportCandidate, ImportInspection } from '@agentform/plugin-sdk';

const GENERATED_FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py'];
/** Matches `generatedFileHeader`'s own output (`@agentform/compiler`'s `codegen-utils.ts`) — `// Source: agent.intake, tool.search` or `# Source: ...`. */
const SOURCE_COMMENT = /(?:\/\/|#)\s*Source:\s*(.+)/;

interface GeneratedManifestShape {
  readonly generatedBy?: unknown;
  readonly adapter?: unknown;
}

function readManifest(rootDir: string): GeneratedManifestShape | undefined {
  const manifestPath = path.join(rootDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as GeneratedManifestShape;
  } catch {
    return undefined;
  }
}

/**
 * Recognizes a project `rootDir` that Agentform itself generated (§22's
 * `manifest.json`, `generatedBy: "agentform"`) — the highest-confidence
 * import case, since every recognized file was written by our own
 * templates. Adapter-agnostic: every adapter's generated files share the
 * same `generatedFileHeader` banner (`// Source: <address>` / `#
 * Source: <address>`), so this needs no per-framework logic at all.
 * Deliberately does not attempt to recover full resource *field* values
 * from generated code — only which resources existed and what kind each
 * was — since parsing each adapter's own generated-code shape back into
 * field values would duplicate that adapter's `generate()` in reverse,
 * for a case (an Agentform-native project, where the real specification
 * is comparatively likely to still exist somewhere) that matters far
 * less than the raw-SDK cases.
 */
export function inspectGeneratedAgentformProject(rootDir: string): ImportInspection {
  const manifest = readManifest(rootDir);
  if (!manifest || manifest.generatedBy !== 'agentform') {
    return { recognized: false, candidates: [], unsupportedConstructs: [], manualActions: [] };
  }

  const files = walkSourceFiles(rootDir, { extensions: GENERATED_FILE_EXTENSIONS });
  const candidates: ImportCandidate[] = [];
  const seenAddresses = new Set<string>();

  for (const file of files) {
    for (const line of file.content.split('\n')) {
      const match = SOURCE_COMMENT.exec(line);
      if (!match?.[1]) {
        continue;
      }
      for (const address of match[1].split(',').map((entry) => entry.trim())) {
        if (seenAddresses.has(address)) {
          continue;
        }
        const [kind, ...idParts] = address.split('.');
        const id = idParts.join('.');
        if (!kind || !id) {
          continue;
        }
        seenAddresses.add(address);
        candidates.push({
          resourceAddress: address,
          kind,
          value: {},
          confidence: 1,
          detail: `Recovered from Agentform's own generated-file header comment in ${file.path} — resource identity only; field values were not reconstructed from generated code.`,
        });
      }
    }
  }

  return {
    recognized: true,
    candidates,
    unsupportedConstructs: [
      'Resource field values (prompts, model settings, tool schemas, workflow wiring) were not reconstructed from generated code — only resource kind and identifier were recovered, from generated-file header comments.',
    ],
    manualActions: [
      `Recreate each resource's full configuration by hand, using the recovered resource list as a checklist (originally generated for target "${typeof manifest.adapter === 'string' ? manifest.adapter : 'unknown'}").`,
      'Run "agentform validate" once the specification is filled in.',
    ],
  };
}
