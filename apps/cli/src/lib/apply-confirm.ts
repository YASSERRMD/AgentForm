import { createInterface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';

export interface PromptStreams {
  readonly input: Readable;
  readonly output: Writable;
}

/**
 * Asks for explicit confirmation before applying critical-risk changes
 * (§15.9 "Confirm high-risk actions") — only `"yes"` (case-insensitive,
 * surrounding whitespace ignored) approves; anything else, including an
 * empty answer, is a decline. `streams` is injected the same way
 * `promptForMissing` (`init-prompt.ts`) is, so this is unit-testable
 * against fake input/output rather than only exercisable through a real
 * TTY — the caller is responsible for only invoking this when
 * `process.stdin`/`process.stdout` are actually a TTY in the first place.
 */
export async function confirmCriticalChanges(
  resourceAddresses: readonly string[],
  streams: PromptStreams,
): Promise<boolean> {
  const rl = createInterface({ input: streams.input, output: streams.output });
  try {
    streams.output.write('\nThe following changes are CRITICAL risk and require confirmation:\n');
    for (const address of resourceAddresses) {
      streams.output.write(`  - ${address}\n`);
    }
    const answer = (await rl.question('\nType "yes" to approve and apply: ')).trim();
    return answer.toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}
