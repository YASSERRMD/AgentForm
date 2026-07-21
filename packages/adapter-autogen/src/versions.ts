/**
 * Exact, pinned dependency versions for the generated project (§21
 * "Generated dependency versions", Phase 8 minimum test "Generated
 * dependency pinning", carried into Phase 9). Verified against the real
 * `autogen-agentchat`/`autogen-ext` packages — installed in a real
 * virtualenv and inspected directly (`inspect.signature` against the real
 * `AssistantAgent`/`RoundRobinGroupChat`/termination conditions, and real
 * scripts actually run against them) — not guessed from training data.
 * Targets the modern, layered v0.4+ architecture (`autogen-core` +
 * `autogen-agentchat` + `autogen-ext`), never the legacy `pyautogen`/
 * `autogen` v0.2 package, which is a different, incompatible API.
 */
export const AUTOGEN_AGENTCHAT_VERSION = '0.7.5';
export const AUTOGEN_EXT_VERSION = '0.7.5';
/** Verified from the installed packages' own METADATA (`Requires-Python: >=3.10`) for autogen-agentchat, autogen-ext, and autogen-core alike. */
export const PYTHON_VERSION_REQUIREMENT = '>=3.10';
