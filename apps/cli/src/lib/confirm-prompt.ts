import { createInterface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';

export interface PromptStreams {
  readonly input: Readable;
  readonly output: Writable;
}

/**
 * Writes `message` then asks `question`, approving only on an exact
 * (case-insensitive, whitespace-trimmed) `"yes"` — anything else,
 * including an empty answer, is a decline. Shared by every command that
 * needs a real confirmation gate (`agentform apply`'s critical-change
 * confirmation, `agentform rollback`'s "this will change deployed state"
 * confirmation): `streams` is injected the same way `promptForMissing`
 * (`init-prompt.ts`) is, so this is unit-testable against fake
 * input/output rather than only exercisable through a real TTY — the
 * caller is responsible for only invoking this when
 * `process.stdin`/`process.stdout` are actually a TTY in the first place.
 */
export async function confirmAction(
  message: string,
  streams: PromptStreams,
  question = '\nType "yes" to approve: ',
): Promise<boolean> {
  const rl = createInterface({ input: streams.input, output: streams.output });
  try {
    streams.output.write(message);
    const answer = (await rl.question(question)).trim();
    return answer.toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

/** Confirmation for `agentform apply`'s critical-risk changes (§15.9 "Confirm high-risk actions"). */
export async function confirmCriticalChanges(
  resourceAddresses: readonly string[],
  streams: PromptStreams,
): Promise<boolean> {
  const message = [
    '\nThe following changes are CRITICAL risk and require confirmation:',
    ...resourceAddresses.map((address) => `  - ${address}`),
    '',
  ].join('\n');
  return confirmAction(message, streams, 'Type "yes" to approve and apply: ');
}
