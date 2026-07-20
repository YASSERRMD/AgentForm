/**
 * Exact, pinned dependency versions for the generated project (§21
 * "Generated dependency versions", Phase 8 minimum test "Generated
 * dependency pinning") — never a `^`/`~`/`>=` range. Verified against the
 * real `langgraph` package (installed in a real virtualenv and inspected
 * directly — `inspect.signature` against the real `StateGraph`/`interrupt`/
 * `MemorySaver` — not guessed from training data).
 */
export const LANGGRAPH_VERSION = '0.6.11';
/** Verified from the installed package's own METADATA (`Requires-Python: >=3.9`), not assumed. */
export const PYTHON_VERSION_REQUIREMENT = '>=3.9';
