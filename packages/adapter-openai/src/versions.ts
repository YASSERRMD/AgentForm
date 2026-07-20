/**
 * Exact, pinned dependency versions for the generated project (§21
 * "Generated dependency versions", Phase 8 minimum test "Generated
 * dependency pinning") — never a `^`/`~` range, so a generated
 * `package.json` always resolves to the exact same dependency tree.
 * Verified against the real packages (installed and inspected directly,
 * not guessed from training data) as of this adapter's implementation;
 * bump deliberately, not automatically, when a newer version is verified
 * to work.
 */
export const OPENAI_AGENTS_SDK_VERSION = '0.13.5';
export const ZOD_VERSION = '4.4.3';
export const TYPESCRIPT_VERSION = '7.0.2';
export const TYPES_NODE_VERSION = '24.11.1';
export const NODE_ENGINE_RANGE = '>=22';
