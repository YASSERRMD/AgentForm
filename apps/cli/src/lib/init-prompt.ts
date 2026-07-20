import { createInterface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';
import type { ProjectTemplate } from '../templates/index.js';

export interface PromptStreams {
  readonly input: Readable;
  readonly output: Writable;
}

export interface PromptAnswers {
  readonly name?: string;
  readonly templateId?: string;
}

/**
 * Prompts for whichever of `name`/`templateId` wasn't already given as a
 * flag, using `node:readline/promises` (a Node built-in — no extra
 * dependency needed for this small a prompting surface). `streams` is
 * injected so this is unit-testable against fake input/output rather than
 * only exercisable through a real TTY, which automated tests can't drive
 * (piped stdin is correctly *not* a TTY, so the caller falls back to
 * non-interactive defaults during any CI run — this function is what
 * actually gets exercised interactively, hence testing it directly here).
 */
export async function promptForMissing(
  name: string | undefined,
  templateId: string | undefined,
  templates: readonly ProjectTemplate[],
  streams: PromptStreams,
): Promise<PromptAnswers> {
  const rl = createInterface({ input: streams.input, output: streams.output });
  try {
    let resolvedName = name;
    if (!resolvedName) {
      const answer = (await rl.question('Project name: ')).trim();
      resolvedName = answer || undefined;
    }

    let resolvedTemplateId = templateId;
    if (!resolvedTemplateId) {
      streams.output.write('\nAvailable templates:\n');
      templates.forEach((template, index) => {
        streams.output.write(`  ${index + 1}. ${template.id} — ${template.title}\n`);
      });
      const answer = (await rl.question(`Template [1-${templates.length}] (default: 1): `)).trim();
      const index = answer ? Number.parseInt(answer, 10) - 1 : 0;
      resolvedTemplateId = templates[index]?.id;
    }

    return { name: resolvedName, templateId: resolvedTemplateId };
  } finally {
    rl.close();
  }
}
